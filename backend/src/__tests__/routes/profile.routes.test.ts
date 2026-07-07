import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { loginAs, request, startServer, stopServer } from '../helpers/setup';
import { clearDevResetTokenForTest, readDevResetTokenForTest } from '../../services/otpDelivery.service';

beforeAll(startServer);
afterAll(stopServer);

const jsonHeaders = (auth: { cookie: string; csrf: string }) => ({
  cookie: auth.cookie,
  'content-type': 'application/json',
  'x-csrf-token': auth.csrf,
});

describe('FR03 — Profile management bug fixes', () => {
  test('rejects email tampering even when the frontend email field is read-only', async () => {
    const auth = await loginAs('bidder@bidforgood.test');

    const res = await request('/api/users/profile', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        full_name: 'Demo Bidder',
        username: 'bidder',
        email: 'changed-email@example.com',
        contact_number: '+65 9123 4567',
      }),
    });

    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.match(res.body.errors.email, /cannot be changed/i);
  });

  test('rejects overlong or invalid mobile numbers', async () => {
    const auth = await loginAs('bidder@bidforgood.test');

    const res = await request('/api/users/profile', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        full_name: 'Demo Bidder',
        username: 'bidder',
        contact_number: '1234567891011',
      }),
    });

    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.match(res.body.errors.contact_number, /mobile number/i);
  });

  test('normalises a valid mobile number and reflects it in the profile response and /auth/me', async () => {
    const auth = await loginAs('bidder@bidforgood.test');

    const updated = await request('/api/users/profile', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        full_name: 'Demo Bidder',
        username: 'bidder',
        contact_number: '+65 9123 4567',
      }),
    });

    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.user.contactNumber, '+6591234567');

    const me = await request('/api/auth/me', {
      headers: { cookie: auth.cookie },
    });

    assert.equal(me.response.status, 200);
    assert.equal(me.body.contactNumber, '+6591234567');
  });

  test('requires an emailed verification code before changing password', async () => {
    const email = 'bidder@bidforgood.test';
    const auth = await loginAs(email);
    const newPassword = 'N0tCommon$Fr03Pass2026';

    const missingCode = await request('/api/users/profile/password', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        currentPassword: 'S3cure!Pass2026',
        newPassword,
      }),
    });

    assert.equal(missingCode.response.status, 400);
    assert.equal(missingCode.body.code, 'VALIDATION_ERROR');
    assert.match(missingCode.body.errors.verificationCode, /required/i);

    clearDevResetTokenForTest(email);
    const codeRequest = await request('/api/users/profile/password/verification', {
      method: 'POST',
      headers: jsonHeaders(auth),
      body: JSON.stringify({ currentPassword: 'S3cure!Pass2026' }),
    });
    assert.equal(codeRequest.response.status, 202);

    const otp = readDevResetTokenForTest(email);
    assert.match(String(otp), /^\d{6}$/);

    const wrongOtp = otp === '000000' ? '000001' : '000000';
    const wrongCode = await request('/api/users/profile/password', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        currentPassword: 'S3cure!Pass2026',
        newPassword,
        verificationCode: wrongOtp,
      }),
    });
    assert.equal(wrongCode.response.status, 400);
    assert.equal(wrongCode.body.code, 'PASSWORD_CHANGE_OTP_INVALID');

    const changed = await request('/api/users/profile/password', {
      method: 'PUT',
      headers: jsonHeaders(auth),
      body: JSON.stringify({
        currentPassword: 'S3cure!Pass2026',
        newPassword,
        verificationCode: otp,
      }),
    });
    assert.equal(changed.response.status, 200);

    const loginWithNewPassword = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword }),
    });
    assert.equal(loginWithNewPassword.response.status, 200);
  });
});