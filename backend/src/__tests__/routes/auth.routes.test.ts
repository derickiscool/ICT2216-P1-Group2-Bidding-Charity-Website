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
} from '../../repositories/inMemory.repository';
import { readDevOtpForTest } from '../../services/otpDelivery.service';

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

  test('locks account after five consecutive failed login attempts', async () => {
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
  });
});

describe('SFR01 — Registration & Email Verification', () => {
  test('blocks registration with breached or common passwords', async () => {
    const weak = await postJson('/api/auth/register', {
      email: 'weak@example.com',
      username: 'weakuser',
      full_name: 'Weak User',
      password: 'Password123!',
      roles: ['bidder'],
    });
    assert.equal(weak.response.status, 400);
    assert.match(weak.body.errors.password, /breached|common/i);

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

  test('verifies OTP once, rejects reused OTP, expires old OTP, and locks after three failures', async () => {
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
