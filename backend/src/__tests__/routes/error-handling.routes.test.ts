import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { startServer, stopServer, request } from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

// NFSR12: request-level failures must come back as standardized client errors,
// never as 500s, and never with stack traces or internal detail in the body.
describe('NFSR12 — request error classification over HTTP', () => {
  test('malformed JSON gets a 400 with the standardized schema', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": "broken",,,',
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'ENTITY_PARSE_FAILED');
    assert.ok(!JSON.stringify(res.body).includes('at '), 'stack frames leaked to the client');
  });

  test('an oversized JSON body gets a 413 instead of a 500', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a'.repeat(120 * 1024) }),
    });
    assert.equal(res.response.status, 413);
    assert.equal(res.body.code, 'ENTITY_TOO_LARGE');
  });

  test('unknown API routes return the standardized 404 shape', async () => {
    const res = await request('/api/does-not-exist');
    assert.equal(res.response.status, 404);
    assert.equal(res.body.message, 'Not found');
  });
});
