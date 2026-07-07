import net from 'node:net';
import tls from 'node:tls';
import { sha256 } from '../utils/security';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const KEY_PREFIX = 'bidforgood:auth:failed-login';

type LoginAttemptRecord = {
  count: number;
  firstFailedAt: number;
  lockedUntil?: number;
};

export type LoginLockoutState = {
  locked: boolean;
  count: number;
  lockedUntil?: Date;
};

interface LoginAttemptStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear?(): void;
}

class MemoryLoginAttemptStore implements LoginAttemptStore {
  private readonly records = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | undefined> {
    const record = this.records.get(key);
    if (!record) return undefined;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return undefined;
    }
    return record.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.records.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  clear(): void {
    this.records.clear();
  }
}

type RedisReply = string | number | null | RedisReply[];

class RedisLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly redisUrl: string) {}

  async get(key: string): Promise<string | undefined> {
    const reply = await this.command(['GET', key]);
    return typeof reply === 'string' ? reply : undefined;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.command(['SET', key, value, 'PX', String(ttlMs)]);
  }

  async delete(key: string): Promise<void> {
    await this.command(['DEL', key]);
  }

  private async command(args: string[]): Promise<RedisReply> {
    const url = new URL(this.redisUrl);
    const socket = await this.openSocket(url);
    let buffer = Buffer.alloc(0);

    const readReply = (): Promise<RedisReply> =>
      new Promise((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          try {
            const parsed = parseRedisReply(buffer);
            if (!parsed) return;
            buffer = buffer.subarray(parsed.offset);
            socket.off('data', onData);
            socket.off('error', onError);
            resolve(parsed.reply);
          } catch (error) {
            socket.off('data', onData);
            socket.off('error', onError);
            reject(error);
          }
        };
        const onError = (error: Error) => {
          socket.off('data', onData);
          reject(error);
        };
        socket.on('data', onData);
        socket.once('error', onError);
      });

    const send = async (commandArgs: string[]): Promise<RedisReply> => {
      socket.write(encodeRedisCommand(commandArgs));
      return readReply();
    };

    try {
      if (url.password) {
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        await send(username ? ['AUTH', username, password] : ['AUTH', password]);
      }
      const database = url.pathname.replace('/', '');
      if (database) await send(['SELECT', database]);
      return await send(args);
    } finally {
      socket.end();
    }
  }

  private openSocket(url: URL): Promise<net.Socket | tls.TLSSocket> {
    const port = Number(url.port || 6379);
    const host = url.hostname || '127.0.0.1';
    return new Promise((resolve, reject) => {
      const onConnect = () => resolve(socket);
      const socket = url.protocol === 'rediss:'
        ? tls.connect({ host, port }, onConnect)
        : net.connect({ host, port }, onConnect);
      socket.once('error', reject);
      socket.setTimeout(2000, () => socket.destroy(new Error('Redis login-attempt cache timed out.')));
    });
  }
}

const encodeRedisCommand = (args: string[]): string => {
  const lines = [`*${args.length}`];
  for (const arg of args) {
    lines.push(`$${Buffer.byteLength(arg)}`, arg);
  }
  return `${lines.join('\r\n')}\r\n`;
};

const parseRedisReply = (buffer: Buffer, offset = 0): { reply: RedisReply; offset: number } | undefined => {
  if (offset >= buffer.length) return undefined;
  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return undefined;
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const next = lineEnd + 2;

  if (type === '+') return { reply: line, offset: next };
  if (type === '-') throw new Error(`Redis login-attempt cache error: ${line}`);
  if (type === ':') return { reply: Number(line), offset: next };
  if (type === '$') {
    const length = Number(line);
    if (length === -1) return { reply: null, offset: next };
    const end = next + length;
    if (buffer.length < end + 2) return undefined;
    return { reply: buffer.toString('utf8', next, end), offset: end + 2 };
  }
  if (type === '*') {
    const count = Number(line);
    const replies: RedisReply[] = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisReply(buffer, cursor);
      if (!parsed) return undefined;
      replies.push(parsed.reply);
      cursor = parsed.offset;
    }
    return { reply: replies, offset: cursor };
  }
  throw new Error('Unsupported Redis login-attempt cache reply.');
};

const memoryStore = new MemoryLoginAttemptStore();

const createStore = (): LoginAttemptStore => {
  if (process.env.LOGIN_ATTEMPT_CACHE === 'redis') {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL must be configured when LOGIN_ATTEMPT_CACHE=redis.');
    return new RedisLoginAttemptStore(process.env.REDIS_URL);
  }
  return memoryStore;
};

let store: LoginAttemptStore | undefined;

const getStore = (): LoginAttemptStore => {
  store ??= createStore();
  return store;
};

const cacheKey = (email: string): string => `${KEY_PREFIX}:${sha256(email.trim().toLowerCase())}`;

const readRecord = async (email: string): Promise<LoginAttemptRecord | undefined> => {
  const raw = await getStore().get(cacheKey(email));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as LoginAttemptRecord;
    if (typeof parsed.count !== 'number' || typeof parsed.firstFailedAt !== 'number') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

const writeRecord = async (email: string, record: LoginAttemptRecord): Promise<void> => {
  const now = Date.now();
  const expiry = record.lockedUntil ?? record.firstFailedAt + FAILED_LOGIN_WINDOW_MS;
  await getStore().set(cacheKey(email), JSON.stringify(record), Math.max(expiry - now, 1000));
};

export const getLoginLockoutState = async (email: string): Promise<LoginLockoutState> => {
  const record = await readRecord(email);
  if (!record) return { locked: false, count: 0 };
  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    return { locked: true, count: record.count, lockedUntil: new Date(record.lockedUntil) };
  }
  if ((record.lockedUntil && record.lockedUntil <= now) || record.firstFailedAt + FAILED_LOGIN_WINDOW_MS <= now) {
    await resetLoginFailures(email);
    return { locked: false, count: 0 };
  }
  return { locked: false, count: record.count };
};

export const recordLoginFailure = async (email: string): Promise<LoginLockoutState> => {
  const now = Date.now();
  const existing = await readRecord(email);
  if (existing?.lockedUntil && existing.lockedUntil > now) {
    return { locked: true, count: existing.count, lockedUntil: new Date(existing.lockedUntil) };
  }

  const sameWindow = existing && existing.firstFailedAt + FAILED_LOGIN_WINDOW_MS > now;
  const count = sameWindow ? existing.count + 1 : 1;
  const record: LoginAttemptRecord = {
    count,
    firstFailedAt: sameWindow ? existing.firstFailedAt : now,
  };
  if (count >= MAX_FAILED_LOGIN_ATTEMPTS) record.lockedUntil = now + LOGIN_LOCKOUT_MS;

  await writeRecord(email, record);
  return {
    locked: Boolean(record.lockedUntil && record.lockedUntil > now),
    count,
    lockedUntil: record.lockedUntil ? new Date(record.lockedUntil) : undefined,
  };
};

export const resetLoginFailures = async (email: string): Promise<void> => {
  await getStore().delete(cacheKey(email));
};

export const clearLoginAttemptCacheForTests = (): void => {
  memoryStore.clear();
  store = undefined;
};
