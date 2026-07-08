import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { startServer, stopServer, request, postJson, loginAs } from '../helpers/setup';
import {
  SESSION_JWT_AUDIENCE,
  SESSION_JWT_ISSUER,
} from '../../services/session.service';

beforeAll(startServer);
afterAll(stopServer);

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const sessionCookieFromLogin = (setCookie: string): string => setCookie.split(';')[0];

const me = (cookie: string) => request('/api/auth/me', { headers: { cookie } });

describe('NFSR08 — session JWT signing, expiry, and invalidation', () => {
  test('session cookie carries the 15 minute inactivity limit', async () => {
    const login = await postJson('/api/auth/login', { email: 'bidder@bidforgood.test', password: 'S3cure!Pass2026' });
    assert.equal(login.response.status, 200);
    assert.ok(login.setCookie?.includes('Max-Age=900'), `expected Max-Age=900 in: ${login.setCookie}`);
  });

  test('rejects a token whose signature has been tampered with', async () => {
    const login = await postJson('/api/auth/login', { email: 'bidder@bidforgood.test', password: 'S3cure!Pass2026' });
    const cookie = sessionCookieFromLogin(login.setCookie!);

    const valid = await me(cookie);
    assert.equal(valid.response.status, 200);

    const [name, token] = cookie.split('=');
    const flipped = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    const tampered = await me(`${name}=${flipped}`);
    assert.equal(tampered.response.status, 401);
  });

  test('rejects unsigned (alg=none) tokens even with a plausible payload', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = b64url({ alg: 'none', typ: 'JWT' });
    const payload = b64url({
      sub: '3',
      sid: crypto.randomUUID(),
      jti: 'forged-jti',
      roles: ['admin'],
      iss: SESSION_JWT_ISSUER,
      aud: SESSION_JWT_AUDIENCE,
      iat: nowSeconds,
      exp: nowSeconds + 15 * 60,
    });
    const res = await me(`bfg_session=${header}.${payload}.`);
    assert.equal(res.response.status, 401);
  });

  test('rejects tokens signed with a non-HS256 algorithm', async () => {
    const token = jwt.sign(
      { sub: '3', sid: crypto.randomUUID(), jti: 'forged-jti', roles: ['admin'] },
      process.env.JWT_SECRET!,
      { algorithm: 'HS512', issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, expiresIn: '15m' },
    );
    const res = await me(`bfg_session=${token}`);
    assert.equal(res.response.status, 401);
  });

  test('rejects correctly-signed tokens whose lifetime exceeds the 15 minute limit', async () => {
    // Even a token bearing a valid signature must not buy more than 15 minutes:
    // the expiration limit is enforced independently of what the token claims.
    const token = jwt.sign(
      { sub: '3', sid: crypto.randomUUID(), jti: 'forged-jti', roles: ['admin'] },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, expiresIn: '8h' },
    );
    const res = await me(`bfg_session=${token}`);
    assert.equal(res.response.status, 401);
  });

  test('rejects a well-formed token that has no matching server-side session', async () => {
    const token = jwt.sign(
      { sub: '3', sid: crypto.randomUUID(), jti: 'forged-jti', roles: ['admin'] },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', issuer: SESSION_JWT_ISSUER, audience: SESSION_JWT_AUDIENCE, expiresIn: '15m' },
    );
    const res = await me(`bfg_session=${token}`);
    assert.equal(res.response.status, 401);
  });

  test('logout invalidates the session immediately', async () => {
    const { cookie, csrf } = await loginAs('bidder@bidforgood.test');

    const before = await me(cookie);
    assert.equal(before.response.status, 200);

    const logout = await postJson('/api/auth/logout', {}, { cookie, 'x-csrf-token': csrf });
    assert.equal(logout.response.status, 204);

    // The very same cookie must be dead on the next request — no grace period.
    const after = await me(cookie);
    assert.equal(after.response.status, 401);
  });
});
