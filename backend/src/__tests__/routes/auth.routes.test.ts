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
import { sha256 } from '../../utils/security';

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

  test('admin accounts require password AND a follow-up email OTP — password alone does not create a session', async () => {
    const step1 = await postJson('/api/auth/login', {
      email: 'admin@bidforgood.test',
      password: 'S3cure!Pass2026',
    });
    assert.equal(step1.response.status, 200);
    assert.equal(step1.body.mfaRequired, true);
    assert.equal(step1.setCookie, undefined);

    const otp = readDevOtpForTest('admin@bidforgood.test');
    assert.match(String(otp), /^\d{6}$/);

    const verified = await postJson('/api/auth/login/passwordless/verify', {
      email: 'admin@bidforgood.test',
      otp,
    });
    assert.equal(verified.response.status, 200);
    assert.ok(verified.setCookie?.includes('HttpOnly'));
    assert.ok(verified.csrf);
  });

  test('admin accounts cannot use the passwordless (email-only) login path', async () => {
    const requested = await postJson('/api/auth/login/passwordless/request', {
      email: 'admin@bidforgood.test',
    });
    assert.equal(requested.response.status, 202);
    assert.match(requested.body.message, /if the email matches/i);

    // Suppressed silently (anti-enumeration): no OTP was actually issued, so
    // any code submitted to verify fails the same way as a missing OTP.
    const verified = await postJson('/api/auth/login/passwordless/verify', {
      email: 'admin@bidforgood.test',
      otp: '000000',
    });
    assert.equal(verified.response.status, 401);
  });

  test('non-admin roles may still log in with password alone (no mandatory OTP)', async () => {
    const email = 'bidderonefactor@example.com';
    const password = 'correcthorsebatterystaple11';
    await registerVerifiedUser({
      email,
      username: 'bidderonefactor',
      full_name: 'Bidder One Factor',
      password,
      roles: ['bidder'],
    });

    const ok = await postJson('/api/auth/login', { email, password });
    assert.equal(ok.response.status, 200);
    assert.equal(ok.body.mfaRequired, undefined);
    assert.ok(ok.setCookie?.includes('HttpOnly'));
    assert.ok(ok.csrf);
  });
});

describe('SFR01 — Registration & Email Verification', () => {
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

  test('rejects direct public registration attempts for privileged roles', async () => {
    const strongFixture = 'correcthorsebatterystaple10';
    const rejectedRoles = ['admin', 'charity_staff'] as const;

    for (const role of rejectedRoles) {
      const slug = role.replace('_', '');
      const email = `blocked-${slug}@example.com`;
      const attempt = await postJson('/api/auth/register', {
        email,
        username: `blocked${slug}`,
        full_name: `Blocked ${slug}`,
        ['password']: strongFixture,
        roles: [role],
      });

      assert.equal(attempt.response.status, 400);
      assert.match((attempt.body.errors as Record<string, string>).roles, /not available for public registration/i);
      assert.equal(await getPendingRegistration(email), undefined);
    }
  });

  test('rejects stale privileged pending registrations during OTP verification', async () => {
    const email = 'stale-admin-pending@example.com';
    await query('ALTER TABLE pending_registrations DROP CONSTRAINT IF EXISTS pending_registrations_roles_valid');
    try {
      await savePendingRegistration({
        id: 'stale-admin-pending',
        email,
        username: 'staleadmin',
        full_name: 'Stale Admin',
        passwordHash: 'not-used-after-rejection',
        roles: ['admin'],
        otpHash: sha256('123456'),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        createdAt: new Date(),
      });

      const attempt = await postJson('/api/auth/register/verify', { email, otp: '123456' });

      assert.equal(attempt.response.status, 400);
      assert.equal(attempt.body.code, 'REGISTRATION_VERIFICATION_FAILED');
      assert.equal(await getPendingRegistration(email), undefined);

      const users = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      assert.equal(users.rows.length, 0);
    } finally {
      await query('DELETE FROM pending_registrations WHERE lower(email) = lower($1)', [email]);
      await query(
        `ALTER TABLE pending_registrations
         ADD CONSTRAINT pending_registrations_roles_valid
         CHECK (roles <@ ARRAY['bidder', 'donor', 'charity']::TEXT[])`,
      );
    }
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

  test('rejects login while registration is still pending email verification', async () => {
    const email = 'unverified@example.com';
    const password = 'correcthorsebatterystaple6';
    const start = await postJson('/api/auth/register', {
      email,
      username: 'unverifieduser',
      full_name: 'Unverified User',
      password,
      roles: ['bidder'],
    });
    assert.equal(start.response.status, 202);

    // No `users` row exists yet — the account only becomes real after OTP
    // verification — so logging in with the exact registered credentials
    // must fail the same way as any other unknown/invalid credentials.
    const login = await postJson('/api/auth/login', { email, password });
    assert.equal(login.response.status, 401);
    assert.equal(login.body.message, 'Invalid email or password');

    // Verifying afterwards must still succeed and unlock normal login.
    const otp = readDevOtpForTest(email);
    const verified = await postJson('/api/auth/register/verify', { email, otp });
    assert.equal(verified.response.status, 201);

    const loginAfterVerify = await postJson('/api/auth/login', { email, password });
    assert.equal(loginAfterVerify.response.status, 200);
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

  test('generates a 6-digit OTP for a valid non-admin account', async () => {
    clearDevResetTokenForTest(email);
    const res = await postJson('/api/auth/forgot-password', { email });
    assert.equal(res.response.status, 200);
    assert.match(String(readDevResetTokenForTest(email)), /^\d{6}$/);
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
    assert.match(String(otp), /^\d{6}$/);

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
    assert.match(String(otp), /^\d{6}$/);

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

describe('FSR15 — Passwordless Authentication', () => {
  test('non-admin user can request a passwordless OTP and log in with it', async () => {
    const email = 'fsr15-passwordless@example.com';
    const password = 'correcthorsebatterystaple8';
    await registerVerifiedUser({
      email,
      username: 'fsr15passwordless',
      full_name: 'FSR15 Passwordless',
      password,
      roles: ['bidder'],
    });

    // Step 1: request OTP — returns 202 regardless of whether the email exists (anti-enumeration)
    const requested = await postJson('/api/auth/login/passwordless/request', { email });
    assert.equal(requested.response.status, 202);
    assert.match(requested.body.message, /if the email matches/i);

    const otp = readDevOtpForTest(email);
    assert.match(String(otp), /^\d{6}$/, 'OTP must be a 6-digit code');

    // Step 2: verify OTP — issues a session cookie identical to password login
    const verified = await postJson('/api/auth/login/passwordless/verify', { email, otp });
    assert.equal(verified.response.status, 200);
    assert.ok(verified.setCookie?.includes('HttpOnly'), 'session cookie must be HttpOnly');
    assert.ok(verified.setCookie?.includes('SameSite=Strict'), 'session cookie must be SameSite=Strict');
    assert.ok(verified.csrf, 'CSRF token must be issued alongside the session cookie');
    assert.equal(verified.body.token, undefined, 'raw token must not appear in the response body');
  });

  test('passwordless OTP is rejected after three wrong attempts', async () => {
    const email = 'fsr15-lockout@example.com';
    const password = 'correcthorsebatterystaple9';
    await registerVerifiedUser({
      email,
      username: 'fsr15lockout',
      full_name: 'FSR15 Lockout',
      password,
      roles: ['bidder'],
    });

    await postJson('/api/auth/login/passwordless/request', { email });
    const otp = readDevOtpForTest(email);
    assert.match(String(otp), /^\d{6}$/);

    // First two wrong OTPs return 401; the third hits MAX_OTP_ATTEMPTS and returns 429
    for (let i = 0; i < 2; i++) {
      const wrong = await postJson('/api/auth/login/passwordless/verify', { email, otp: '000000' });
      assert.equal(wrong.response.status, 401);
    }
    const maxed = await postJson('/api/auth/login/passwordless/verify', { email, otp: '000000' });
    assert.equal(maxed.response.status, 429);

    // OTP has been removed — the correct code now also fails (missing OTP)
    const correct = await postJson('/api/auth/login/passwordless/verify', { email, otp });
    assert.equal(correct.response.status, 401);
  });

  test('anti-enumeration: unknown email returns the same 202 generic response', async () => {
    const res = await postJson('/api/auth/login/passwordless/request', {
      email: 'nobody-fsr15@example.com',
    });
    assert.equal(res.response.status, 202);
    assert.match(res.body.message, /if the email matches/i);
  });
});
