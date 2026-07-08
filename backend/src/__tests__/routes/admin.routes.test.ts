import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, stopServer, loginAs, request } from '../helpers/setup';
import { query } from '../../utils/db';
import {
  getJwtSecret,
  getSessionCookieName,
  SESSION_JWT_ALGORITHM,
  SESSION_JWT_AUDIENCE,
  SESSION_JWT_ISSUER,
} from '../../services/session.service';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const seg = token.split('.')[1];
  const padded = seg + '='.repeat((4 - (seg.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

function extractSessionToken(cookie: string): string {
  const [, ...tokenParts] = cookie.split('=');
  return tokenParts.join('=');
}

function cookieForToken(token: string): string {
  return `${getSessionCookieName()}=${token}`;
}

beforeAll(startServer);
afterAll(stopServer);

describe('SFR16 — Admin Session Enforcement', () => {
  test('rejects requests with no session cookie', async () => {
    const res = await request('/api/admin/audit-events');
    assert.equal(res.response.status, 401);
  });

  test('rejects requests with a tampered JWT signature', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const [name, ...tokenParts] = cookie.split('=');
    const token = tokenParts.join('=');
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -4) + (parts[2].endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const tampered = `${name}=${parts.join('.')}`;
    const res = await request('/api/admin/audit-events', { headers: { cookie: tampered } });
    assert.equal(res.response.status, 401);
  });

  test('rejects requests using a signed token with a non-HS256 algorithm', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const token = extractSessionToken(cookie);
    const decoded = decodeJwtPayload(token);
    const wrongAlgorithmToken = jwt.sign(
      {
        sub: String(decoded.sub),
        sid: String(decoded.sid),
        role: decoded.role,
        roles: decoded.roles,
        jti: String(decoded.jti),
      },
      getJwtSecret(),
      {
        algorithm: 'HS384',
        issuer: SESSION_JWT_ISSUER,
        audience: SESSION_JWT_AUDIENCE,
        expiresIn: '15m',
      },
    );

    const res = await request('/api/admin/audit-events', { headers: { cookie: cookieForToken(wrongAlgorithmToken) } });
    assert.equal(res.response.status, 401);
  });

  test('rejects signed JWTs with more than 15 minutes of lifetime', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const token = extractSessionToken(cookie);
    const decoded = decodeJwtPayload(token);
    const longLivedToken = jwt.sign(
      {
        sub: String(decoded.sub),
        sid: String(decoded.sid),
        role: decoded.role,
        roles: decoded.roles,
        jti: String(decoded.jti),
      },
      getJwtSecret(),
      {
        algorithm: SESSION_JWT_ALGORITHM,
        issuer: SESSION_JWT_ISSUER,
        audience: SESSION_JWT_AUDIENCE,
        expiresIn: '30m',
      },
    );

    const res = await request('/api/admin/audit-events', { headers: { cookie: cookieForToken(longLivedToken) } });
    assert.equal(res.response.status, 401);
  });

  test('rejects requests from a valid bidder session (role mismatch)', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/admin/audit-events', { headers: { cookie } });
    assert.equal(res.response.status, 403);
  });

  test('allows requests from a valid admin session', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const res = await request('/api/admin/audit-events', { headers: { cookie } });
    assert.equal(res.response.status, 200);
  });

  test('rejects requests after the absolute session lifetime is exceeded', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const { sid } = decodeJwtPayload(extractSessionToken(cookie));
    assert.equal(typeof sid, 'string', 'JWT payload should contain sid');
    // updateSession intentionally omits absolute_expires_at from its UPDATE list,
    // so we write directly to backdate it for this test.
    await query('UPDATE sessions SET absolute_expires_at = $1 WHERE sid = $2', [
      new Date(Date.now() - 1000),
      sid,
    ]);
    const res = await request('/api/admin/audit-events', { headers: { cookie } });
    assert.equal(res.response.status, 401);
  });
});

describe('SFR16 — Admin Self-Lockout Guard (F-005)', () => {
  test('rejects an administrator attempting to disable their own account', async () => {
    const { cookie, csrf } = await loginAs('admin@bidforgood.test');

    // Fetch own profile to get the admin's UUID
    const me = await request('/api/auth/me', { headers: { cookie } });
    assert.equal(me.response.status, 200);
    const adminUuid = (me.body as unknown as { uuid: string }).uuid;
    assert.ok(adminUuid, 'admin UUID must be present in /me response');

    const res = await request(`/api/admin/users/${adminUuid}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': csrf },
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'SELF_ACTION_FORBIDDEN');
  });

  test('allows an administrator to change the status of a different account', async () => {
    const admin = await loginAs('admin@bidforgood.test');
    const bidder = await loginAs('bidder@bidforgood.test');

    const bidderProfile = await request('/api/auth/me', { headers: { cookie: bidder.cookie } });
    const bidderUuid = (bidderProfile.body as unknown as { uuid: string }).uuid;

    // Deactivate the bidder account
    const deactivate = await request(`/api/admin/users/${bidderUuid}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(deactivate.response.status, 200);
    assert.equal((deactivate.body as unknown as { is_active: boolean }).is_active, false);

    // Re-activate so the account is usable by later tests
    const reactivate = await request(`/api/admin/users/${bidderUuid}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      body: JSON.stringify({ is_active: true }),
    });
    assert.equal(reactivate.response.status, 200);
    assert.equal((reactivate.body as unknown as { is_active: boolean }).is_active, true);
  });
});
