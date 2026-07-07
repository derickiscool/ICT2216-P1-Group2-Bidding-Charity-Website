import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { startServer, stopServer, loginAs, request } from '../helpers/setup';
import { query } from '../../utils/db';

function decodeJwtPayload(token: string): Record<string, unknown> {
  const seg = token.split('.')[1];
  const padded = seg + '='.repeat((4 - (seg.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
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
    const [, ...tokenParts] = cookie.split('=');
    const { sid } = decodeJwtPayload(tokenParts.join('='));
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
