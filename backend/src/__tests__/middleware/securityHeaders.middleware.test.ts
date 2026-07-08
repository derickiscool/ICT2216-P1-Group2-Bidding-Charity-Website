import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../../app';
import { startServer, stopServer, request } from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

describe('OWASP ZAP security headers', () => {
  test('API responses suppress framework leakage and include hardening headers', async () => {
    const res = await request('/api/health');

    assert.equal(res.response.status, 200);
    assert.equal(res.response.headers.get('x-powered-by'), null);
    assert.equal(res.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.response.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
    assert.equal(res.response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(res.response.headers.get('cache-control'), 'no-store');
    assert.match(res.response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(res.response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains; preload');
  });

  test('production does not expose the diagnostic database endpoint by default', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEnableDbTest = process.env.ENABLE_DB_TEST_ENDPOINT;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DB_TEST_ENDPOINT;

    const app = createApp();
    const server = createServer(app);
    try {
      await new Promise<void>(resolve => server.listen(0, resolve));
      const addr = server.address();
      assert.ok(typeof addr === 'object' && addr);
      const response = await fetch(`http://127.0.0.1:${addr.port}/api/db-test`);

      assert.equal(response.status, 404);
      assert.equal(response.headers.get('x-powered-by'), null);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      process.env.NODE_ENV = previousNodeEnv;
      if (previousEnableDbTest === undefined) {
        delete process.env.ENABLE_DB_TEST_ENDPOINT;
      } else {
        process.env.ENABLE_DB_TEST_ENDPOINT = previousEnableDbTest;
      }
    }
  });
});
