import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  postJson,
  putJson,
  loginAs,
  registerVerifiedUser,
} from '../helpers/setup';
import {
  clearDevEmailChangeOtpForTest,
  clearDevPasswordChangeOtpForTest,
  readDevEmailChangeOtpForTest,
  readDevPasswordChangeOtpForTest,
} from '../../services/otpDelivery.service';

beforeAll(startServer);
afterAll(stopServer);

const PASSWORD = 'correcthorsebatterystaple';
const NEW_PASSWORD = 'Secur3Profile!2026';

const authHeaders = (cookie: string, csrf: string) => ({ cookie, 'x-csrf-token': csrf });

describe('FR03 — profile details and contact number updates', () => {
  test('normalises a valid Singapore mobile number and returns it in the profile response', async () => {
    const email = 'fr03-mobile-ok@example.com';
    await registerVerifiedUser({ email, username: 'fr03mobileok', full_name: 'FR03 Mobile OK', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);

    const res = await putJson(
      '/api/users/profile',
      { full_name: 'FR03 Mobile OK', username: 'fr03mobileok', contact_number: '+65 9123 4567' },
      authHeaders(cookie, csrf),
    );

    assert.equal(res.response.status, 200);
    assert.equal(res.body.user.contactNumber, '+6591234567');
  });

  test('rejects overlong or non-Singapore mobile numbers', async () => {
    const email = 'fr03-mobile-bad@example.com';
    await registerVerifiedUser({ email, username: 'fr03mobilebad', full_name: 'FR03 Mobile Bad', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);

    const res = await putJson(
      '/api/users/profile',
      { full_name: 'FR03 Mobile Bad', username: 'fr03mobilebad', contact_number: '1234567891011' },
      authHeaders(cookie, csrf),
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.contact_number, /Singapore mobile number/i);
  });

  test('rejects email tampering through the profile update endpoint', async () => {
    const email = 'fr03-email-tamper@example.com';
    await registerVerifiedUser({ email, username: 'fr03tamper', full_name: 'FR03 Tamper', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);

    const res = await putJson(
      '/api/users/profile',
      {
        full_name: 'FR03 Tamper',
        username: 'fr03tamper',
        contact_number: '91234567',
        email: 'attacker@example.com',
      },
      authHeaders(cookie, csrf),
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.email, /cannot be changed/i);
  });

  test('updates email only after password reauthentication and both email codes are verified', async () => {
    const email = 'fr03-email-change@example.com';
    const newEmail = 'fr03-email-change-new@example.com';
    await registerVerifiedUser({ email, username: 'fr03emailchange', full_name: 'FR03 Email Change', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevEmailChangeOtpForTest();

    const start = await postJson(
      '/api/users/profile/email/request',
      { currentPassword: PASSWORD, newEmail },
      authHeaders(cookie, csrf),
    );
    assert.equal(start.response.status, 202);

    const currentCode = readDevEmailChangeOtpForTest(email);
    assert.match(String(currentCode), /^\d{6}$/);

    const currentVerified = await postJson(
      '/api/users/profile/email/verify-current',
      { verificationCode: currentCode },
      authHeaders(cookie, csrf),
    );
    assert.equal(currentVerified.response.status, 202);

    const newCode = readDevEmailChangeOtpForTest(newEmail);
    assert.match(String(newCode), /^\d{6}$/);

    const changed = await putJson(
      '/api/users/profile/email',
      { verificationCode: newCode },
      authHeaders(cookie, csrf),
    );
    assert.equal(changed.response.status, 200);
    assert.equal(changed.body.user.email, newEmail);

    const oldLogin = await postJson('/api/auth/login', { email, password: PASSWORD });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await postJson('/api/auth/login', { email: newEmail, password: PASSWORD });
    assert.equal(newLogin.response.status, 200);
  });
});

describe('FR03/SFR03 — password changes require email verification', () => {
  test('rejects password change when the verification code is missing', async () => {
    const email = 'fr03-pwd-missing-code@example.com';
    await registerVerifiedUser({ email, username: 'fr03pwdmiss', full_name: 'FR03 Password Missing Code', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);

    const res = await putJson(
      '/api/users/profile/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      authHeaders(cookie, csrf),
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.verificationCode, /required/i);
  });

  test('does not issue a verification code when the current password is wrong', async () => {
    const email = 'fr03-pwd-wrong-current@example.com';
    await registerVerifiedUser({ email, username: 'fr03pwdwrong', full_name: 'FR03 Password Wrong', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevPasswordChangeOtpForTest(email);

    const res = await postJson(
      '/api/users/profile/password/verification',
      { currentPassword: 'wrong-password' },
      authHeaders(cookie, csrf),
    );

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.currentPassword, /incorrect/i);
    assert.equal(readDevPasswordChangeOtpForTest(email), undefined);
  });

  test('updates password only after current password and email code are valid', async () => {
    const email = 'fr03-pwd-success@example.com';
    await registerVerifiedUser({ email, username: 'fr03pwdsuccess', full_name: 'FR03 Password Success', password: PASSWORD, roles: ['bidder'] });
    const { cookie, csrf } = await loginAs(email, PASSWORD);
    clearDevPasswordChangeOtpForTest(email);

    const requested = await postJson(
      '/api/users/profile/password/verification',
      { currentPassword: PASSWORD },
      authHeaders(cookie, csrf),
    );
    assert.equal(requested.response.status, 202);

    const verificationCode = readDevPasswordChangeOtpForTest(email);
    assert.match(String(verificationCode), /^\d{6}$/);

    const changed = await putJson(
      '/api/users/profile/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, verificationCode },
      authHeaders(cookie, csrf),
    );
    assert.equal(changed.response.status, 200);

    const oldLogin = await postJson('/api/auth/login', { email, password: PASSWORD });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await postJson('/api/auth/login', { email, password: NEW_PASSWORD });
    assert.equal(newLogin.response.status, 200);
  });
});
