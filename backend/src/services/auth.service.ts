import crypto from 'crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import {
  addUser, findUserByEmail, getPendingRegistration, removePendingRegistration, savePendingRegistration, toPublicUser, updateUser,
  saveLoginOtp, getLoginOtp, removeLoginOtp,
  savePasswordResetToken, getPasswordResetTokenByEmail, removePasswordResetToken, revokeAllSessionsByUserId,
} from '../repositories';
import type { UserRole } from '../types/domain';
import { badRequest, tooManyRequests, unauthorised } from '../utils/errors';
import { isStrongPassword } from '../utils/breachedPasswords';
import { normalizeEmail, randomToken, sha256, safeString, isValidEmail } from '../utils/security';
import { audit } from './audit.service';
import { createSession, setSessionCookie, clearSessionCookie, revokeBySid } from './session.service';
import { sendRegistrationOtp, sendPasswordResetOtp, sendLoginOtp } from './otpDelivery.service';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 3 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;
const VALID_ROLES = new Set<UserRole>(['bidder', 'donor', 'charity_staff', 'charity', 'admin']);
const GENERIC_REGISTRATION_MESSAGE = 'If the account can be registered, a verification OTP will be sent to the submitted email address.';

export interface RegisterInput {
  full_name?: string;
  username?: string;
  email?: string;
  password?: string;
  roles?: UserRole[];
}

export const beginRegistration = async (input: RegisterInput, req?: Request): Promise<{ message: string }> => {
  const email = normalizeEmail(input.email ?? '');
  const fullName = safeString(input.full_name, 120);
  const username = safeString(input.username, 40);
  const roles: UserRole[] = Array.isArray(input.roles) && input.roles.length > 0
    ? input.roles.filter((r): r is UserRole => VALID_ROLES.has(r)).slice(0, 2)
    : ['bidder'];
  const password = String(input.password ?? '');
  const generic = { message: GENERIC_REGISTRATION_MESSAGE };

  const errors: Record<string, string> = {};
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (fullName.length < 2) errors.full_name = 'Full name is required.';
  if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) errors.username = 'Username must be 3-40 characters using letters, numbers, or underscores.';
  if (!isStrongPassword(password)) errors.password = 'Password must be 8-128 characters and must not match known breached or common passwords.';
  if (roles.length === 0) errors.roles = 'At least one valid role is required.';
  if (Object.keys(errors).length > 0) throw badRequest('Registration input failed validation.', 'VALIDATION_ERROR', errors);

  const existing = await findUserByEmail(email);
  if (existing) {
    await audit(req, 'AUTH_REGISTER_DUPLICATE_SUPPRESSED', { email }, 'user');
    return generic;
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const registrationId = randomToken(16);
  await savePendingRegistration({
    id: registrationId,
    email,
    username,
    full_name: fullName,
    roles,
    passwordHash,
    otpHash: sha256(otp),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    createdAt: new Date()
  });
  await sendRegistrationOtp(email, otp);
  await audit(req, 'AUTH_REGISTER_OTP_CREATED', { email, roles }, 'pending_registration', registrationId);
  return generic;
};

export const verifyRegistrationOtp = async (emailInput: string, otpInput: string, req?: Request) => {
  const email = normalizeEmail(emailInput);
  const pending = await getPendingRegistration(email);
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    if (pending) await removePendingRegistration(email);
    await audit(req, 'AUTH_REGISTER_VERIFY_FAILED', { email, reason: 'missing_or_expired' }, 'pending_registration');
    throw badRequest('Registration verification failed.', 'REGISTRATION_VERIFICATION_FAILED');
  }
  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await removePendingRegistration(email);
    await audit(req, 'AUTH_REGISTER_VERIFY_LOCKED', { email }, 'pending_registration', pending.id);
    throw tooManyRequests('Too many verification attempts. Please register again.');
  }
  if (pending.otpHash !== sha256(String(otpInput))) {
    pending.attempts += 1;
    await audit(req, 'AUTH_REGISTER_VERIFY_FAILED', { email, reason: 'otp_mismatch', attempts: pending.attempts }, 'pending_registration', pending.id);
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await removePendingRegistration(email);
      throw tooManyRequests('Too many verification attempts. Please register again.');
    }
    await savePendingRegistration(pending);
    throw badRequest('Registration verification failed.', 'REGISTRATION_VERIFICATION_FAILED');
  }
  if (await findUserByEmail(email)) {
    await removePendingRegistration(email);
    await audit(req, 'AUTH_REGISTER_VERIFY_FAILED', { email, reason: 'duplicate_email' }, 'pending_registration', pending.id);
    throw badRequest('Registration verification failed.', 'REGISTRATION_VERIFICATION_FAILED');
  }
  const user = await addUser({
    email: pending.email,
    username: pending.username,
    full_name: pending.full_name,
    roles: pending.roles,
    passwordHash: pending.passwordHash,
    is_verified: true
  });
  await removePendingRegistration(email);
  await audit(req, 'AUTH_REGISTER_VERIFIED', { email, roles: pending.roles }, 'user', user.uuid, user.id);
  return toPublicUser(user);
};

export const login = async (emailInput: string, password: string, req: Request, res: Response) => {
  const email = normalizeEmail(emailInput);
  const generic = unauthorised('Invalid email or password');
  const user = await findUserByEmail(email);
  if (!user || !user.is_active || !user.is_verified) {
    await audit(req, 'AUTH_LOGIN_FAILED', { email, reason: 'invalid_credentials_or_inactive' }, 'user');
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit(req, 'AUTH_LOGIN_LOCKED', { email }, 'user', user.uuid, user.id);
    throw tooManyRequests('Too many failed login attempts. Please try again later.');
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    await updateUser(user);
    await audit(req, 'AUTH_LOGIN_FAILED', { email, failedLoginAttempts: user.failedLoginAttempts }, 'user', user.uuid, user.id);
    throw generic;
  }
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date().toISOString();
  await updateUser(user);
  const safeUser = toPublicUser(user);
  const session = await createSession(safeUser);
  setSessionCookie(res, session.token);
  res.setHeader('X-CSRF-Token', session.csrfToken);
  await audit(req, 'AUTH_LOGIN_SUCCESS', { email, sid: session.sid }, 'user', user.uuid, user.id);
  return { user: safeUser, csrfToken: session.csrfToken };
};

export const logout = async (sid: string | undefined, req: Request, res: Response): Promise<void> => {
  if (sid) await revokeBySid(sid);
  clearSessionCookie(res);
  await audit(req, 'AUTH_LOGOUT', { sid }, 'session', sid, req.user?.id);
};

export const requestLoginOtp = async (emailInput: string, req?: Request): Promise<{ message: string }> => {
  const email = normalizeEmail(emailInput);
  const generic = { message: 'If the email matches an active account, a login OTP will be sent.' };

  if (!isValidEmail(email)) {
    throw badRequest('Invalid email address.', 'VALIDATION_ERROR');
  }

  const user = await findUserByEmail(email);
  if (!user || !user.is_active || !user.is_verified) {
    await audit(req, 'AUTH_PASSWORDLESS_REQUEST_SUPPRESSED', { email, reason: 'user_not_found_or_inactive' }, 'user');
    return generic;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit(req, 'AUTH_PASSWORDLESS_REQUEST_LOCKED', { email }, 'user', user.uuid, user.id);
    throw tooManyRequests('Too many login attempts. Please try again later.');
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await saveLoginOtp({
    user_id: user.id,
    email,
    otpHash: sha256(otp),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    createdAt: new Date(),
  });

  await sendLoginOtp(email, otp);
  await audit(req, 'AUTH_PASSWORDLESS_OTP_CREATED', { email }, 'user', user.uuid, user.id);
  return generic;
};

export const verifyLoginOtp = async (emailInput: string, otpInput: string, req: Request, res: Response) => {
  const email = normalizeEmail(emailInput);
  const user = await findUserByEmail(email);
  const genericErr = unauthorised('Invalid email or login OTP');

  if (!user || !user.is_active || !user.is_verified) {
    await audit(req, 'AUTH_PASSWORDLESS_VERIFY_FAILED', { email, reason: 'user_not_found_or_inactive' }, 'user');
    throw genericErr;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await audit(req, 'AUTH_PASSWORDLESS_VERIFY_LOCKED', { email }, 'user', user.uuid, user.id);
    throw tooManyRequests('Too many login attempts. Please try again later.');
  }

  const pending = await getLoginOtp(user.id);
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    if (pending) await removeLoginOtp(user.id);
    await audit(req, 'AUTH_PASSWORDLESS_VERIFY_FAILED', { email, reason: 'missing_or_expired' }, 'user', user.uuid, user.id);
    throw genericErr;
  }

  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await removeLoginOtp(user.id);
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    }
    await updateUser(user);
    await audit(req, 'AUTH_PASSWORDLESS_VERIFY_LOCKED', { email, attempts: pending.attempts }, 'user', user.uuid, user.id);
    throw tooManyRequests('Too many verification attempts. Please request a new OTP.');
  }

  if (pending.otpHash !== sha256(String(otpInput))) {
    pending.attempts += 1;
    await saveLoginOtp(pending);
    await audit(req, 'AUTH_PASSWORDLESS_VERIFY_FAILED', { email, reason: 'otp_mismatch', attempts: pending.attempts }, 'user', user.uuid, user.id);
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await removeLoginOtp(user.id);
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      }
      await updateUser(user);
      throw tooManyRequests('Too many verification attempts. Please request a new OTP.');
    }
    throw genericErr;
  }

  await removeLoginOtp(user.id);
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date().toISOString();
  await updateUser(user);

  const safeUser = toPublicUser(user);
  const session = await createSession(safeUser);
  setSessionCookie(res, session.token);
  res.setHeader('X-CSRF-Token', session.csrfToken);

  await audit(req, 'AUTH_LOGIN_SUCCESS', { email, method: 'passwordless', sid: session.sid }, 'user', user.uuid, user.id);
  return { user: safeUser, csrfToken: session.csrfToken };
};

const RESET_OTP_TTL_MS = 3 * 60 * 1000;
const MAX_RESET_OTP_ATTEMPTS = 5;
const GENERIC_RESET_MESSAGE = 'If that email is registered, a one-time code has been sent.';

export const requestPasswordReset = async (emailInput: string, req?: Request): Promise<{ message: string }> => {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) return { message: GENERIC_RESET_MESSAGE };
  const user = await findUserByEmail(email);
  if (!user || !user.is_active || !user.is_verified || user.roles.includes('admin')) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[BidForGood DEV RESET] suppressed — no active/verified non-admin account for email=${email}`);
    }
    await audit(req, 'AUTH_PASSWORD_RESET_SUPPRESSED', { email }, 'user');
    return { message: GENERIC_RESET_MESSAGE };
  }
  const otp = crypto.randomInt(100000, 1000000).toString();
  await savePasswordResetToken({
    email,
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + RESET_OTP_TTL_MS),
    attempts: 0,
    createdAt: new Date(),
  });
  await sendPasswordResetOtp(email, otp);
  await audit(req, 'AUTH_PASSWORD_RESET_REQUESTED', { email }, 'user', user.uuid, user.id);
  return { message: GENERIC_RESET_MESSAGE };
};

export const resetPassword = async (emailInput: string, otpInput: string, newPassword: string, req?: Request): Promise<{ message: string }> => {
  const email = normalizeEmail(emailInput);
  const invalid = badRequest('The code is invalid or has expired. Please request a new one.', 'RESET_OTP_INVALID');
  if (!isStrongPassword(newPassword)) {
    throw badRequest('Password must be 8-128 characters and must not match known breached or common passwords.', 'VALIDATION_ERROR', {
      password: 'Password must be 8-128 characters and must not match known breached or common passwords.',
    });
  }
  const record = await getPasswordResetTokenByEmail(email);
  if (!record) throw invalid;
  if (record.expiresAt.getTime() <= Date.now()) {
    await removePasswordResetToken(email);
    throw invalid;
  }
  if (record.tokenHash !== sha256(String(otpInput))) {
    record.attempts += 1;
    if (record.attempts >= MAX_RESET_OTP_ATTEMPTS) {
      await removePasswordResetToken(email);
    } else {
      await savePasswordResetToken(record);
    }
    throw invalid;
  }
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    await removePasswordResetToken(email);
    throw invalid;
  }
  user.passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await updateUser(user);
  await removePasswordResetToken(email);
  await revokeAllSessionsByUserId(user.id);
  await audit(req, 'AUTH_PASSWORD_RESET_COMPLETED', { email }, 'user', user.uuid, user.id);
  return { message: 'Your password has been reset. You can now log in with your new password.' };
};
