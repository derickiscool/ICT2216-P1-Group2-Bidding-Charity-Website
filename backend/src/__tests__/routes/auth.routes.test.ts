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
  getPendingRegistration,
  savePendingRegistration,
} from '../../repositories/postgres.repository';
import {
  readDevOtpForTest,
  readDevResetTokenForTest,
  clearDevResetTokenForTest,
} from '../../services/otpDelivery.service';
import { query } from '../../utils/db';

const RESET_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

beforeAll(startServer);
afterAll(stopServer);

describe('SFR02 — Authentication & Session Management', () => {
  test('returns HttpOnly cookie with SameSite=Strict on successful login', async () => {
    const bad = await postJson('/api/auth/login', {
      email: 'admin@bidforgood.test',
      password: 'wrong',
    });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.body.message, 'Invalid email or password');

    const ok = await postJson('/api/auth/login', {
      email: 'bidder@bidforgood.test',
      password: 'S3cure!Pass2026',
    });
    assert.equal(ok.response.status, 200);
    assert.ok(ok.setCookie?.includes('HttpOnly'));
    assert.ok(ok.setCookie?.includes('SameSite=Strict'));
    assert.ok(ok.csrf);
    assert.equal(ok.body.token, undefined);
  });

  test('rejects Authorization Bearer token when session cookie is absent', async () => {
    const ok = await postJson('/api/auth/login', {
      email: 'bidder@bidforgood.test',
      password: 'S3cure!Pass2026',
    });
    const token = ok.setCookie!.split(';')[0].split('=').slice(1).join('=');

    const bearerOnly = await request('/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(bearerOnly.response.status, 401);
  });

  test('locks account after five consecutive failed login attempts using cache-backed tracking', async () => {
    const email = 'lockoutuser@example.com';
    const password = 'correcthorsebatterystaple5';
    await registerVerifiedUser({
      email,
      username: 'lockoutuser',
      full_name: 'Lockout User',
      password,
      roles: ['bidder'],
    });

    for (let index = 0; index < 5; index += 1) {
      const failed = await postJson('/api/auth/login', {
        email,
        password: `wrong-password-${index}`,
      });
      assert.equal(failed.response.status, 401);
      assert.equal(failed.body.message, 'Invalid email or password');
    }

    const locked = await postJson('/api/auth/login', { email, password });
    assert.equal(locked.response.status, 429);
    assert.match(locked.body.message, /Too many failed login attempts/i);

    const persisted = await query<{ failed_login_attempts: number; locked_until: Date | null }>(
      'SELECT failed_login_attempts, locked_until FROM users WHERE email = $1',
      [email],
    );
    assert.equal(Number(persisted.rows[0].failed_login_attempts), 0);
    assert.equal(persisted.rows[0].locked_until, null);
  });
});

describe('SFR01 — Registration & Email Verification', () => {
  test('rejects privileged roles during public registration', async () => {
    const admin = await postJson('/api/auth/register', {
      email: 'selfadmin@example.com',
      username: 'selfadmin',
      full_name: 'Self Admin',
      password: 'correcthorsebatterystaple9',
      roles: ['admin'],
    });
    assert.equal(admin.response.status, 400);
    assert.match(admin.body.errors.roles, /cannot be selected/i);

    const staff = await postJson('/api/auth/register', {
      email: 'selfstaff@example.com',
      username: 'selfstaff',
      full_name: 'Self Staff',
      password: 'correcthorsebatterystaple10',
      roles: ['charity_staff'],
    });
    assert.equal(staff.response.status, 400);
    assert.match(staff.body.errors.roles, /cannot be selected/i);
  });

  test('blocks registration with breached, common, or dictionary passwords', async () => {
    const weak = await postJson('/api/auth/register', {
      email: 'weak@example.com',
      username: 'weakuser',
      full_name: 'Weak User',
      password: 'Password123!',
      roles: ['bidder'],
    });
    assert.equal(weak.response.status, 400);
    assert.match(weak.body.errors.password, /breached|common/i);

    const dictionary = await postJson('/api/auth/register', {
      email: 'dictionary@example.com',
      username: 'dictionaryuser',
      full_name: 'Dictionary User',
      password: 'Sunshine2026!',
      roles: ['bidder'],
    });
    assert.equal(dictionary.response.status, 400);
    assert.match(dictionary.body.errors.password, /dictionary/i);

    const validNew = await postJson('/api/auth/register', {
      email: 'newperson@example.com',
      username: 'newperson',
      full_name: 'New Person',
      password: 'correcthorsebatterystaple',
      roles: ['bidder'],
    });
    const dup = await postJson('/api/auth/register', {
      email: 'admin@bidforgood.test',
      username: 'someone',
      full_name: 'Someone',
      password: 'correcthorsebatterystaple',
      roles: ['bidder'],
    });

    assert.equal(validNew.response.status, 202);
    assert.equal(dup.response.status, 202);
    assert.deepEqual(Object.keys(validNew.body).sort(), ['message']);
    assert.deepEqual(Object.keys(dup.body).sort(), ['message']);
    assert.deepEqual(validNew.body, dup.body);
  });

  test('verifies registration OTP once, rejects reused OTP, expires old OTP, and locks after three failures', async () => {
    const email = 'otpuser@example.com';
    const start = await postJson('/api/auth/register', {
      email,
      username: 'otpuser',
      full_name: 'OTP User',
      password: 'correcthorsebatterystaple2',
      roles: ['bidder'],
    });
    assert.equal(start.response.status, 202);
    const otp = readDevOtpForTest(email);
    assert.match(String(otp), /^\d{6}$/);

    const verified = await postJson('/api/auth/register/verify', { email, otp });
    assert.equal(verified.response.status, 201);
    assert.equal(verified.body.user.email, email);

    const reused = await postJson('/api/auth/register/verify', { email, otp });
    assert.equal(reused.response.status, 400);
    assert.equal(reused.body.code, 'REGISTRATION_VERIFICATION_FAILED');

    const expiringEmail = 'expiredotp@example.com';
    await postJson('/api/auth/register', {
      email: expiringEmail,
      username: 'expiredotp',
      full_name: 'Expired OTP',
      password: 'correcthorsebatterystaple3',
      roles: ['bidder'],
    });
    const pending = await getPendingRegistration(expiringEmail);
    assert.ok(pending);
    pending.expiresAt = new Date(Date.now() - 1000);
    await savePendingRegistration(pending);
    const expired = await postJson('/api/auth/register/verify', {
      email: expiringEmail,
      otp: readDevOtpForTest(expiringEmail),
    });
    assert.equal(expired.response.status, 400);

    const lockEmail = 'lockedotp@example.com';
    await postJson('/api/auth/register', {
      email: lockEmail,
      username: 'lockedotp',
      full_name: 'Locked OTP',
      password: 'correcthorsebatterystaple4',
      roles: ['bidder'],
    });
    assert.equal(
      (
        await postJson('/api/auth/register/verify', {
          email: lockEmail,
          otp: '000000',
        })
      ).response.status,
      400,
    );
    assert.equal(
      (
        await postJson('/api/auth/register/verify', {
          email: lockEmail,
          otp: '000001',
        })
      ).response.status,
      400,
    );
    const locked = await postJson('/api/auth/register/verify', {
      email: lockEmail,
      otp: '000002',
    });
    assert.equal(locked.response.status, 429);
  });
});

describe('Password Reset Flow', () => {
  const email = 'pwreset@example.com';
  const original = 'correcthorsebatterystaple7';
  const updated = 'NewStr0ng!Pass2026';

  beforeAll(async () => {
    await registerVerifiedUser({
      email,
      username: 'pwresetuser',
      full_name: 'PW Reset User',
      password: original,
      roles: ['bidder'],
    });
  });

  test('always returns the generic message for an unknown email (user enumeration protection)', async () => {
    const res = await postJson('/api/auth/forgot-password', { email: 'nobody@nowhere.com' });
    assert.equal(res.response.status, 200);
    assert.match(res.body.message, /if that email is registered/i);
  });

  test('suppresses OTP for admin accounts — admin cannot reset password via this flow', async () => {
    clearDevResetTokenForTest('admin@bidforgood.test');
    const res = await postJson('/api/auth/forgot-password', { email: 'admin@bidforgood.test' });
    assert.equal(res.response.status, 200);
    assert.match(res.body.message, /if that email is registered/i);
    assert.equal(readDevResetTokenForTest('admin@bidforgood.test'), undefined);
  });

  test('generates a 256-bit reset token for a valid non-admin account', async () => {
    clearDevResetTokenForTest(email);
    const res = await postJson('/api/auth/forgot-password', { email });
    assert.equal(res.response.status, 200);
    assert.match(String(readDevResetTokenForTest(email)), RESET_TOKEN_RE);
  });

  test('rejects reset with a wrong OTP but keeps the token for retry', async () => {
    clearDevResetTokenForTest(email);
    await postJson('/api/auth/forgot-password', { email });
    const otp = readDevResetTokenForTest(email);

    const wrongRes = await postJson('/api/auth/reset-password', {
      email,
      token: '000000',
      password: updated,
    });
    assert.equal(wrongRes.response.status, 400);
    assert.equal(wrongRes.body.code, 'RESET_OTP_INVALID');

    // token still valid — correct OTP should now succeed
    const correctRes = await postJson('/api/auth/reset-password', {
      email,
      token: otp,
      password: updated,
    });
    assert.equal(correctRes.response.status, 200);

    // restore original password so later tests can use it
    clearDevResetTokenForTest(email);
    await postJson('/api/auth/forgot-password', { email });
    const otp2 = readDevResetTokenForTest(email);
    await postJson('/api/auth/reset-password', { email, token: otp2, password: original });
  });

  test('locks out after 5 consecutive wrong OTP attempts', async () => {
    clearDevResetTokenForTest(email);
    await postJson('/api/auth/forgot-password', { email });
    const otp = readDevResetTokenForTest(email);
    assert.match(String(otp), RESET_TOKEN_RE);

    for (let i = 0; i < 5; i++) {
      const res = await postJson('/api/auth/reset-password', {
        email,
        token: '000000',
        password: updated,
      });
      assert.equal(res.response.status, 400);
      assert.equal(res.body.code, 'RESET_OTP_INVALID');
    }

    // token removed after 10 failures — correct OTP now fails too
    const lockedOut = await postJson('/api/auth/reset-password', {
      email,
      token: otp,
      password: updated,
    });
    assert.equal(lockedOut.response.status, 400);
    assert.equal(lockedOut.body.code, 'RESET_OTP_INVALID');
  });

  test('rejects reset with an expired OTP', async () => {
    clearDevResetTokenForTest(email);
    await postJson('/api/auth/forgot-password', { email });
    await query('UPDATE password_reset_tokens SET expires_at = $1 WHERE email = $2', [
      new Date(Date.now() - 1000),
      email,
    ]);
    const otp = readDevResetTokenForTest(email);
    const res = await postJson('/api/auth/reset-password', {
      email,
      token: otp,
      password: updated,
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'RESET_OTP_INVALID');
  });

  test('resets password successfully, old password rejected, all sessions revoked', async () => {
    // log in to create a live session, then reset — session should be revoked
    const { cookie } = await loginAs(email, original);

    clearDevResetTokenForTest(email);
    await postJson('/api/auth/forgot-password', { email });
    const otp = readDevResetTokenForTest(email);
    assert.match(String(otp), RESET_TOKEN_RE);

    const reset = await postJson('/api/auth/reset-password', {
      email,
      token: otp,
      password: updated,
    });
    assert.equal(reset.response.status, 200);

    // old session is revoked
    const meRes = await request('/api/auth/me', { headers: { cookie } });
    assert.equal(meRes.response.status, 401);

    // old password rejected
    const oldLogin = await postJson('/api/auth/login', { email, password: original });
    assert.equal(oldLogin.response.status, 401);

    // new password works
    const newLogin = await postJson('/api/auth/login', { email, password: updated });
    assert.equal(newLogin.response.status, 200);
  });
});
