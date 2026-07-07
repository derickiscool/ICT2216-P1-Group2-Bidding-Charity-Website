import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  assertJwtLifetimeWithinIdleLimit,
  getJwtSecret,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_JWT_ALGORITHM,
} from '../../services/session.service';

describe('getJwtSecret', () => {
  test('throws when production JWT_SECRET is missing or too short', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = 'short';
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.NODE_ENV = oldNodeEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
});

describe('NFSR08 session token limits', () => {
  test('uses HS256 and a 15 minute inactivity limit', () => {
    assert.equal(SESSION_JWT_ALGORITHM, 'HS256');
    assert.equal(SESSION_IDLE_TIMEOUT_MINUTES, 15);
  });

  test('accepts JWT payloads within the inactivity limit', () => {
    assert.doesNotThrow(() => assertJwtLifetimeWithinIdleLimit({ iat: 1000, exp: 1900 }));
  });

  test('rejects JWT payloads that exceed the inactivity limit', () => {
    assert.throws(
      () => assertJwtLifetimeWithinIdleLimit({ iat: 1000, exp: 2000 }),
      /Authentication required/,
    );
  });

  test('rejects JWT payloads without immutable issued and expiry timestamps', () => {
    assert.throws(
      () => assertJwtLifetimeWithinIdleLimit({ sub: '1' }),
      /Authentication required/,
    );
  });
});
