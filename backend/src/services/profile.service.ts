import crypto from 'crypto';
import argon2 from 'argon2';
import type { Request } from 'express';
import {
  findUserById,
  findUserByUsername,
  getPasswordResetTokenByEmail,
  removePasswordResetToken,
  savePasswordResetToken,
  toPublicUser,
  updateUser,
} from '../repositories';
import type { PublicUser } from '../repositories';
import { badRequest, notFound, tooManyRequests } from '../utils/errors';
import { sha256 } from '../utils/security';
import { isStrongPassword } from '../utils/breachedPasswords';
import { audit } from './audit.service';
import { sendPasswordChangeVerificationOtp } from './otpDelivery.service';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const PROFILE_NAME_MAX = 80;
const USERNAME_MAX = 30;
const USERNAME_ROLES = new Set(['bidder', 'donor']);
const CONTACT_INPUT_MAX = 13; // longest allowed UI format is "+65 9123 4567".
const PASSWORD_CHANGE_OTP_TTL_MS = 15 * 60 * 1000;
const MAX_PASSWORD_CHANGE_OTP_ATTEMPTS = 5;
const PASSWORD_POLICY_MESSAGE = 'Password must be 8-128 characters and must not match known breached, common, or dictionary passwords.';

export interface UpdateProfileInput {
  full_name?: unknown;
  username?: unknown;
  contact_number?: unknown;
  email?: unknown;
  password?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
}

export interface RequestPasswordChangeVerificationInput {
  currentPassword?: unknown;
}

export interface ChangePasswordInput {
  currentPassword?: unknown;
  newPassword?: unknown;
  verificationCode?: unknown;
}

const cleanTextInput = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
};

const hasSubmittedField = (input: UpdateProfileInput, field: keyof UpdateProfileInput): boolean =>
  Object.prototype.hasOwnProperty.call(input, field);

const userUsesUsername = (roles: readonly string[]): boolean =>
  roles.some(role => USERNAME_ROLES.has(role));

const normalizeSingaporeMobileNumber = (value: unknown): string | undefined => {
  const raw = cleanTextInput(value);
  if (raw.length === 0) return undefined;

  // Keep the accepted surface small: optional +65, digits, spaces, and dashes only.
  // Parentheses and long international numbers are rejected instead of silently normalised.
  if (raw.length > CONTACT_INPUT_MAX || !/^\+?[0-9\s-]+$/.test(raw)) return undefined;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('65') && digits.length === 10) digits = digits.slice(2);

  // Singapore mobile numbers are exactly 8 digits and start with 8 or 9.
  if (!/^[89]\d{7}$/.test(digits)) return undefined;
  return `+65${digits}`;
};

export const updateProfile = async (userId: number, input: UpdateProfileInput, req?: Request): Promise<PublicUser> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const errors: Record<string, string> = {};
  const allowUsername = userUsesUsername(user.roles);

  // FR03 allows normal profile edits, but email/password are sensitive fields.
  // Reject them server-side so API tampering cannot bypass the read-only frontend.
  if (hasSubmittedField(input, 'email')) errors.email = 'Email cannot be changed from the profile page.';
  if (hasSubmittedField(input, 'password') || hasSubmittedField(input, 'currentPassword') || hasSubmittedField(input, 'newPassword')) {
    errors.password = 'Use the password change flow to update your password.';
  }

  // Charity Organisation and Charity Staff accounts are identified by their
  // organisation/email. User-facing usernames remain only for bidder/donor roles,
  // so tampered username updates for charity roles are rejected explicitly.
  if (!allowUsername && hasSubmittedField(input, 'username')) {
    errors.username = 'Username is only used for bidder and donor accounts.';
  }

  const fullName = cleanTextInput(input.full_name);
  if (fullName.length < 2) errors.full_name = 'Full name must be at least 2 characters.';
  else if (fullName.length > PROFILE_NAME_MAX) errors.full_name = `Full name must be ${PROFILE_NAME_MAX} characters or less.`;

  const username = allowUsername ? cleanTextInput(input.username) : user.username;
  if (allowUsername && !/^[A-Za-z0-9_]{3,30}$/.test(username)) {
    errors.username = `Username must be 3-${USERNAME_MAX} characters using letters, numbers, or underscores.`;
  }

  const rawContact = cleanTextInput(input.contact_number);
  const contactNumber = rawContact.length > 0 ? normalizeSingaporeMobileNumber(rawContact) : undefined;
  if (rawContact.length > 0 && !contactNumber) {
    errors.contact_number = 'Enter a valid Singapore mobile number, e.g. 91234567 or +65 9123 4567.';
  }

  if (Object.keys(errors).length > 0) throw badRequest('Profile update validation failed.', 'VALIDATION_ERROR', errors);

  if (allowUsername && username.toLowerCase() !== user.username.toLowerCase()) {
    const taken = await findUserByUsername(username);
    if (taken && taken.id !== user.id) throw badRequest('Username is already taken.', 'USERNAME_TAKEN');
  }

  const previous = { full_name: user.full_name, username: allowUsername ? user.username : undefined, contactNumber: user.contactNumber };

  user.full_name = fullName;
  if (allowUsername) user.username = username;
  user.contactNumber = contactNumber;

  await updateUser(user);
  await audit(req, 'PROFILE_UPDATED', { previous, updated: { full_name: fullName, username: allowUsername ? username : undefined, contactNumber } }, 'user', user.uuid, user.id);

  return toPublicUser(user);
};

export const requestPasswordChangeVerification = async (
  userId: number,
  input: RequestPasswordChangeVerificationInput,
  req?: Request,
): Promise<{ message: string }> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const currentPassword = String(input.currentPassword ?? '');
  if (!currentPassword) {
    throw badRequest('Password verification failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is required.' });
  }

  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    await audit(req, 'PASSWORD_CHANGE_REAUTH_FAILED', {}, 'user', user.uuid, user.id);
    throw badRequest('Password verification failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  // Store only a hash of the one-time code. The code itself is sent to the user's
  // registered email, which keeps password change tied to account ownership.
  const otp = crypto.randomInt(100000, 1000000).toString();
  await savePasswordResetToken({
    email: user.email,
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + PASSWORD_CHANGE_OTP_TTL_MS),
    attempts: 0,
    createdAt: new Date(),
  });

  await sendPasswordChangeVerificationOtp(user.email, otp);
  await audit(req, 'PASSWORD_CHANGE_VERIFICATION_SENT', {}, 'user', user.uuid, user.id);
  return { message: 'A verification code has been sent to your registered email address.' };
};

export const changePassword = async (userId: number, input: ChangePasswordInput, req?: Request): Promise<void> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const currentPassword = String(input.currentPassword ?? '');
  const newPassword = String(input.newPassword ?? '');
  const verificationCode = String(input.verificationCode ?? '').trim();

  const errors: Record<string, string> = {};
  if (!currentPassword) errors.currentPassword = 'Current password is required.';
  if (!newPassword) errors.newPassword = 'New password is required.';
  else if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_POLICY_MESSAGE;
  if (!verificationCode) errors.verificationCode = 'Verification code is required.';
  else if (!/^\d{6}$/.test(verificationCode)) errors.verificationCode = 'Verification code must be 6 digits.';
  if (Object.keys(errors).length > 0) throw badRequest('Password change validation failed.', 'VALIDATION_ERROR', errors);

  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  const token = await getPasswordResetTokenByEmail(user.email);
  const invalidOtp = badRequest('The verification code is invalid or has expired. Please request a new one.', 'PASSWORD_CHANGE_OTP_INVALID', {
    verificationCode: 'The verification code is invalid or has expired.',
  });
  if (!token) throw invalidOtp;
  if (token.expiresAt.getTime() <= Date.now()) {
    await removePasswordResetToken(user.email);
    throw invalidOtp;
  }
  if (token.tokenHash !== sha256(verificationCode)) {
    token.attempts += 1;
    if (token.attempts >= MAX_PASSWORD_CHANGE_OTP_ATTEMPTS) {
      await removePasswordResetToken(user.email);
      throw tooManyRequests('Too many verification attempts. Please request a new code.');
    }
    await savePasswordResetToken(token);
    throw invalidOtp;
  }

  const isSameAsCurrentPassword = await argon2.verify(user.passwordHash, newPassword);
  if (isSameAsCurrentPassword) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { newPassword: 'New password must be different from your current password.' });
  }

  user.passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
  await updateUser(user);
  await removePasswordResetToken(user.email);
  await audit(req, 'PASSWORD_CHANGED', {}, 'user', user.uuid, user.id);
};
