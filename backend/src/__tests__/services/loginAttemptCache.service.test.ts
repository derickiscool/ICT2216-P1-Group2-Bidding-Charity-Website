import { afterEach, beforeEach, describe, jest, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  clearLoginAttemptCacheForTests,
  getLoginLockoutState,
  LOGIN_LOCKOUT_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  recordLoginFailure,
  resetLoginFailures,
} from '../../services/loginAttemptCache.service';

// NFSR07: the login-attempt cache must lock an account for exactly 15 minutes after
// 5 failures, entirely in the caching layer (no users-table writes are involved here).
const EMAIL = 'nfsr07-cache@example.com';
const START = new Date('2026-07-08T09:00:00Z');

beforeEach(() => {
  delete process.env.LOGIN_ATTEMPT_CACHE;
  clearLoginAttemptCacheForTests();
  jest.useFakeTimers();
  jest.setSystemTime(START);
});

afterEach(() => {
  jest.useRealTimers();
  clearLoginAttemptCacheForTests();
});

describe('NFSR07 — failed-login cache lockout policy', () => {
  test('locks on the 5th failure for exactly 15 minutes', async () => {
    for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
      const state = await recordLoginFailure(EMAIL);
      assert.equal(state.locked, false, `attempt ${attempt} must not lock yet`);
      assert.equal(state.count, attempt);
    }

    const locking = await recordLoginFailure(EMAIL);
    assert.equal(locking.locked, true);
    assert.equal(locking.count, MAX_FAILED_LOGIN_ATTEMPTS);
    assert.equal(locking.lockedUntil?.getTime(), START.getTime() + LOGIN_LOCKOUT_MS);

    // One millisecond before the lockout ends the account is still locked...
    jest.setSystemTime(new Date(START.getTime() + LOGIN_LOCKOUT_MS - 1));
    const stillLocked = await getLoginLockoutState(EMAIL);
    assert.equal(stillLocked.locked, true);

    // ...and once the 15 minutes elapse it unlocks with a clean slate.
    jest.setSystemTime(new Date(START.getTime() + LOGIN_LOCKOUT_MS + 1));
    const unlocked = await getLoginLockoutState(EMAIL);
    assert.equal(unlocked.locked, false);
    assert.equal(unlocked.count, 0);
  });

  test('further attempts while locked do not extend the lockout window', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
      await recordLoginFailure(EMAIL);
    }
    jest.setSystemTime(new Date(START.getTime() + 60 * 1000));
    const duringLockout = await recordLoginFailure(EMAIL);
    assert.equal(duringLockout.locked, true);
    assert.equal(duringLockout.lockedUntil?.getTime(), START.getTime() + LOGIN_LOCKOUT_MS);
  });

  test('a successful login resets the failure counter', async () => {
    await recordLoginFailure(EMAIL);
    await recordLoginFailure(EMAIL);
    await resetLoginFailures(EMAIL);

    const afterReset = await getLoginLockoutState(EMAIL);
    assert.equal(afterReset.count, 0);

    const nextFailure = await recordLoginFailure(EMAIL);
    assert.equal(nextFailure.count, 1);
  });

  test('failures older than the 15 minute window do not accumulate', async () => {
    await recordLoginFailure(EMAIL);
    await recordLoginFailure(EMAIL);
    await recordLoginFailure(EMAIL);

    jest.setSystemTime(new Date(START.getTime() + LOGIN_LOCKOUT_MS + 1));
    const freshWindow = await recordLoginFailure(EMAIL);
    assert.equal(freshWindow.count, 1);
    assert.equal(freshWindow.locked, false);
  });

  test('tracking is case- and whitespace-insensitive so aliasing cannot dodge the lockout', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
      await recordLoginFailure('  NFSR07-Cache@Example.COM  ');
    }
    const state = await getLoginLockoutState(EMAIL);
    assert.equal(state.locked, true);
  });
});
