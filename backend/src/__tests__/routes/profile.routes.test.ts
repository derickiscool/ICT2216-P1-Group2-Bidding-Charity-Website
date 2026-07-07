import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  postJson,
  request,
  loginAs,
  registerVerifiedUser,
} from '../helpers/setup';
import {
  readDevEmailChangeOtpForTest,
  clearDevEmailChangeOtpForTest,
} from '../../services/otpDelivery.service';

beforeAll(startServer);
afterAll(stopServer);

const PASSWORD = 'correcthorsebatterystaple';

describe('SFR03 — Verified email change (OWASP no-MFA dual confirmation)', () => {
  test('rejects the request when the current password is wrong and issues no codes', async () => {
    const email = 'echange1@example.com';
    await registerVerifiedUser({ email, username: 'echange1', full_name: 'E Change One', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevEmailChangeOtpForTest();

    const res = await postJson(
      '/api/users/profile/email',
      { newEmail: 'echange1-new@example.com', currentPassword: 'wrong-password' },
      { cookie, 'x-csrf-token': csrf },
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.currentPassword, /incorrect/i);
    assert.equal(readDevEmailChangeOtpForTest('echange1-new@example.com'), undefined);
  });

  test('rejects a new email that is already registered', async () => {
    const email = 'echange2@example.com';
    await registerVerifiedUser({ email, username: 'echange2', full_name: 'E Change Two', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);

    const res = await postJson(
      '/api/users/profile/email',
      { newEmail: 'admin@bidforgood.test', currentPassword: PASSWORD },
      { cookie, 'x-csrf-token': csrf },
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.ok(errors.newEmail);
  });

  test('does not contact the new address until the current address is confirmed (anti-abuse)', async () => {
    const email = 'echange5@example.com';
    const newEmail = 'echange5-new@example.com';
    await registerVerifiedUser({ email, username: 'echange5', full_name: 'E Change Five', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevEmailChangeOtpForTest();

    const requested = await postJson(
      '/api/users/profile/email',
      { newEmail, currentPassword: PASSWORD },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(requested.response.status, 202);

    // Only the current address has been mailed at this point.
    assert.match(String(readDevEmailChangeOtpForTest(email)), /^\d{6}$/);
    assert.equal(readDevEmailChangeOtpForTest(newEmail), undefined);

    // Confirming the new-email step before the current step is rejected.
    const premature = await postJson(
      '/api/users/profile/email/confirm',
      { newEmailOtp: '123456' },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(premature.response.status, 400);
    assert.equal(premature.body.code, 'EMAIL_CHANGE_STEP_REQUIRED');
    assert.equal(readDevEmailChangeOtpForTest(newEmail), undefined);
  });

  test('applies the change after current then new codes are confirmed, and revokes the session', async () => {
    const email = 'echange3@example.com';
    const newEmail = 'echange3-new@example.com';
    await registerVerifiedUser({ email, username: 'echange3', full_name: 'E Change Three', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevEmailChangeOtpForTest();

    const requested = await postJson(
      '/api/users/profile/email',
      { newEmail, currentPassword: PASSWORD },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(requested.response.status, 202);
    const oldCode = readDevEmailChangeOtpForTest(email);
    assert.match(String(oldCode), /^\d{6}$/);

    // Step 2: confirm the current address → this triggers the code to the new address.
    const verified = await postJson(
      '/api/users/profile/email/verify-current',
      { oldEmailOtp: oldCode },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(verified.response.status, 202);
    const newCode = readDevEmailChangeOtpForTest(newEmail);
    assert.match(String(newCode), /^\d{6}$/);
    assert.notEqual(newCode, oldCode);

    // Step 3: confirm the new address → change applied.
    const confirmed = await postJson(
      '/api/users/profile/email/confirm',
      { newEmailOtp: newCode },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(confirmed.response.status, 200);

    // Session was revoked → old cookie no longer authenticates.
    const me = await request('/api/auth/me', { headers: { cookie } });
    assert.equal(me.response.status, 401);

    // Old email no longer works; the new email + original password does.
    const oldLogin = await postJson('/api/auth/login', { email, password: PASSWORD });
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await postJson('/api/auth/login', { email: newEmail, password: PASSWORD });
    assert.equal(newLogin.response.status, 200);
  });

  test('locks the current-email step after too many wrong attempts', async () => {
    const email = 'echange4@example.com';
    const newEmail = 'echange4-new@example.com';
    await registerVerifiedUser({ email, username: 'echange4', full_name: 'E Change Four', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevEmailChangeOtpForTest();

    const requested = await postJson(
      '/api/users/profile/email',
      { newEmail, currentPassword: PASSWORD },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(requested.response.status, 202);

    let lastStatus = 0;
    for (let i = 0; i < 5; i += 1) {
      const attempt = await postJson(
        '/api/users/profile/email/verify-current',
        { oldEmailOtp: '111111' },
        { cookie, 'x-csrf-token': csrf },
      );
      lastStatus = attempt.response.status;
    }
    assert.equal(lastStatus, 429);

    // Request is cleared after lockout, so the real code no longer works.
    const realCode = readDevEmailChangeOtpForTest(email);
    const afterLock = await postJson(
      '/api/users/profile/email/verify-current',
      { oldEmailOtp: realCode },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(afterLock.response.status, 400);
  });
});
