import crypto from 'crypto';
import type { Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { addSession, getSession, revokeSession, updateSession } from '../repositories';
import type { SessionRecord, User } from '../types/domain';
import { randomToken, sha256 } from '../utils/security';
import { unauthorised } from '../utils/errors';

export const SESSION_JWT_ISSUER = 'bidforgood';
export const SESSION_JWT_AUDIENCE = 'bidforgood-web';
export const SESSION_JWT_ALGORITHM = 'HS256' as const;
export const SESSION_IDLE_TIMEOUT_MINUTES = 15;
export const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MINUTES = 30;
export const SESSION_ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_MINUTES * 60 * 1000;
const JWT_CLOCK_TOLERANCE_SECONDS = 2;
const devJwtSecret = crypto.randomBytes(32).toString('hex');

export interface CreatedSession {
  token: string;
  csrfToken: string;
  sid: string;
}

export interface VerifiedSession {
  userId: number;
  sid: string;
  jti: string;
  csrfTokenHash: string;
  issuedAtMs: number;
  absoluteExpiresAtMs: number;
}

export const getSessionCookieName = (): string => process.env.NODE_ENV === 'production' ? '__Host-bfg_session' : 'bfg_session';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
    }
    return devJwtSecret;
  }
  return secret;
};

const isNumericDate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const assertJwtLifetimeWithinIdleLimit = (decoded: JwtPayload): void => {
  if (!isNumericDate(decoded.iat) || !isNumericDate(decoded.exp)) {
    throw unauthorised('Authentication required');
  }

  const lifetimeSeconds = decoded.exp - decoded.iat;
  const idleLimitSeconds = SESSION_IDLE_TIMEOUT_MS / 1000;
  if (lifetimeSeconds <= 0 || lifetimeSeconds > idleLimitSeconds + JWT_CLOCK_TOLERANCE_SECONDS) {
    throw unauthorised('Authentication required');
  }
};

export const createSession = async (user: Omit<User, 'passwordHash'>): Promise<CreatedSession> => {
  const secret = getJwtSecret();
  const sid = crypto.randomUUID();
  const jti = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_IDLE_TIMEOUT_MS);
  const absoluteExpiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS);
  const record: SessionRecord = {
    sid,
    userId: user.id,
    jtiHash: sha256(jti),
    csrfTokenHash: sha256(csrfToken),
    expiresAt,
    absoluteExpiresAt,
    createdAt: new Date(),
    lastSeenAt: new Date()
  };
  await addSession(record);
  const token = jwt.sign({ sub: String(user.id), sid, role: user.roles[0], roles: user.roles, jti }, secret, {
    algorithm: SESSION_JWT_ALGORITHM, issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, expiresIn: `${SESSION_IDLE_TIMEOUT_MINUTES}m`
  });
  return { token, csrfToken, sid };
};

export const setSessionCookie = (res: Response, token: string): void => {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(getSessionCookieName(), token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_IDLE_TIMEOUT_MS
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(getSessionCookieName(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
};

export const verifySessionToken = async (token: string): Promise<VerifiedSession> => {
  const secret = getJwtSecret();
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, secret, { issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, algorithms: [SESSION_JWT_ALGORITHM] }) as JwtPayload;
  } catch {
    throw unauthorised('Authentication required');
  }
  assertJwtLifetimeWithinIdleLimit(decoded);
  if (!decoded.sid || !decoded.jti || !decoded.sub) throw unauthorised('Authentication required');
  const record = await getSession(String(decoded.sid));
  const now = Date.now();
  if (!record || record.revokedAt || record.expiresAt.getTime() <= now || record.absoluteExpiresAt.getTime() <= now) throw unauthorised('Authentication required');
  if (record.jtiHash !== sha256(String(decoded.jti))) throw unauthorised('Authentication required');
  record.lastSeenAt = new Date();
  record.expiresAt = new Date(Math.min(now + SESSION_IDLE_TIMEOUT_MS, record.absoluteExpiresAt.getTime()));
  await updateSession(record);
  return {
    userId: Number(decoded.sub),
    sid: String(decoded.sid),
    jti: String(decoded.jti),
    csrfTokenHash: record.csrfTokenHash,
    issuedAtMs: (decoded.iat as number) * 1000,
    absoluteExpiresAtMs: record.absoluteExpiresAt.getTime(),
  };
};

export const SESSION_REFRESH_THRESHOLD_MS = SESSION_IDLE_TIMEOUT_MS / 2;

// NFSR08: the idle timeout is a *sliding* window. verifySessionToken already slides
// the server-side record, but the JWT's own exp is fixed at signing, so without a
// refresh an active user would still be logged out 15 minutes after login. Once a
// token is past half its window, mint a replacement for the same sid/jti (keeping
// the jti means in-flight requests carrying the old token stay valid until its
// original exp), bounded by the session's absolute expiry.
export const issueRefreshedSessionToken = (session: VerifiedSession, roles: readonly string[]): string | undefined => {
  const now = Date.now();
  if (now - session.issuedAtMs < SESSION_REFRESH_THRESHOLD_MS) return undefined;
  const remainingAbsoluteSeconds = Math.floor((session.absoluteExpiresAtMs - now) / 1000);
  if (remainingAbsoluteSeconds <= 0) return undefined;
  const expiresInSeconds = Math.min(SESSION_IDLE_TIMEOUT_MS / 1000, remainingAbsoluteSeconds);
  return jwt.sign(
    { sub: String(session.userId), sid: session.sid, role: roles[0], roles, jti: session.jti },
    getJwtSecret(),
    { algorithm: SESSION_JWT_ALGORITHM, issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, expiresIn: expiresInSeconds },
  );
};

export const revokeBySid = async (sid: string): Promise<void> => revokeSession(sid);
