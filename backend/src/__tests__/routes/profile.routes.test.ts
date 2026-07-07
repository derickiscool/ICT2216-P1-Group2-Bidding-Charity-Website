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

  test('applies the change only after BOTH codes are confirmed, then revokes the session', async () => {
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

    const newCode = readDevEmailChangeOtpForTest(newEmail);
    const oldCode = readDevEmailChangeOtpForTest(email);
    assert.match(String(newCode), /^\d{6}$/);
    assert.match(String(oldCode), /^\d{6}$/);
    assert.notEqual(newCode, oldCode);

    // Only one code is not enough.
    const halfway = await postJson(
      '/api/users/profile/email/confirm',
      { newEmailOtp: newCode, oldEmailOtp: '000000' },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(halfway.response.status, 400);

    const confirmed = await postJson(
      '/api/users/profile/email/confirm',
      { newEmailOtp: newCode, oldEmailOtp: oldCode },
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

  test('locks the confirmation after too many wrong attempts', async () => {
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
    const oldCode = readDevEmailChangeOtpForTest(email);

    let lastStatus = 0;
    for (let i = 0; i < 5; i += 1) {
      const attempt = await postJson(
        '/api/users/profile/email/confirm',
        { newEmailOtp: '111111', oldEmailOtp: oldCode },
        { cookie, 'x-csrf-token': csrf },
      );
      lastStatus = attempt.response.status;
    }
    assert.equal(lastStatus, 429);

    // Request is cleared after lockout, so even the real code no longer confirms.
    const afterLock = await postJson(
      '/api/users/profile/email/confirm',
      { newEmailOtp: '111111', oldEmailOtp: oldCode },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(afterLock.response.status, 400);
  });
});
