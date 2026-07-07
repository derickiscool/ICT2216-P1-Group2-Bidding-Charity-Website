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
import { sendPasswordResetOtp } from './otpDelivery.service';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const MAX_FULL_NAME_LENGTH = 120;
const MAX_USERNAME_LENGTH = 40;
const PASSWORD_CHANGE_OTP_TTL_MS = 3 * 60 * 1000;
const MAX_PASSWORD_CHANGE_OTP_ATTEMPTS = 5;

const PASSWORD_POLICY_MESSAGE = 'Password must be 8-128 characters and must not match known breached, common, or dictionary passwords.';
const PASSWORD_CHANGE_OTP_MESSAGE = 'A verification code has been sent to your registered email address.';
const PASSWORD_CHANGE_OTP_INVALID = 'The password change verification code is invalid or has expired.';

export interface UpdateProfileInput {
  full_name?: unknown;
  username?: unknown;
  contact_number?: unknown;
  email?: unknown;
}

export interface ChangePasswordInput {
  currentPassword?: unknown;
  newPassword?: unknown;
  verificationCode?: unknown;
  otp?: unknown;
  token?: unknown;
}

// Sanitises profile text without silently truncating it. The service validates length
// afterwards so users get a clear validation error instead of having data cut off.
const cleanProfileText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
};

// FR03 uses "mobile number" as contact information. The project is Singapore-based,
// so we accept either local format (91234567) or country-code format (+6591234567)
// and store it consistently as E.164-like +65XXXXXXXX.
const normaliseSingaporeMobile = (value: string): string | undefined => {
  const compact = value.replace(/[\s\-()]/g, '');
  if (!/^\+?\d+$/.test(compact)) return undefined;

  let local = compact;
  if (local.startsWith('+65')) local = local.slice(3);
  else if (local.startsWith('65') && local.length === 10) local = local.slice(2);

  if (!/^[89]\d{7}$/.test(local)) return undefined;
  return `+65${local}`;
};

export const updateProfile = async (userId: number, input: UpdateProfileInput, req?: Request): Promise<PublicUser> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const body = (input && typeof input === 'object' ? input : {}) as UpdateProfileInput;
  const errors: Record<string, string> = {};

  // Email is intentionally read-only for FR03. A disabled frontend field is not enough
  // because attackers can still send an email property directly to the API.
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    errors.email = 'Email address cannot be changed from the profile page.';
  }

  const fullName = cleanProfileText(body.full_name);
  if (fullName.length < 2) errors.full_name = 'Full name must be at least 2 characters.';
  else if (fullName.length > MAX_FULL_NAME_LENGTH) errors.full_name = `Full name must be ${MAX_FULL_NAME_LENGTH} characters or less.`;

  const username = cleanProfileText(body.username);
  if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
    errors.username = `Username must be 3-${MAX_USERNAME_LENGTH} characters using letters, numbers, or underscores.`;
  }

  const rawContact = cleanProfileText(body.contact_number);
  const contactNumber = rawContact.length > 0 ? normaliseSingaporeMobile(rawContact) : undefined;
  if (rawContact.length > 0 && !contactNumber) {
    errors.contact_number = 'Mobile number must be a valid Singapore mobile number (8 digits starting with 8 or 9, optional +65).';
  }

  if (Object.keys(errors).length > 0) throw badRequest('Profile update validation failed.', 'VALIDATION_ERROR', errors);

  if (username.toLowerCase() !== user.username.toLowerCase()) {
    const taken = await findUserByUsername(username);
    if (taken && taken.id !== user.id) throw badRequest('Username is already taken.', 'USERNAME_TAKEN');
  }

  const previous = { full_name: user.full_name, username: user.username, contactNumber: user.contactNumber };

  user.full_name = fullName;
  user.username = username;
  user.contactNumber = contactNumber;

  await updateUser(user);
  await audit(req, 'PROFILE_UPDATED', { previous, updated: { full_name: fullName, username, contactNumber } }, 'user', user.uuid, user.id);

  return toPublicUser(user);
};

export const requestPasswordChangeVerification = async (userId: number, input: Pick<ChangePasswordInput, 'currentPassword'>, req?: Request): Promise<{ message: string }> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');
  const body = (input && typeof input === 'object' ? input : {}) as Pick<ChangePasswordInput, 'currentPassword'>;

  // Re-authenticate before sending the email code. Otherwise, a stolen but active
  // session could trigger password-change emails without knowing the password.
  const currentPassword = String(body.currentPassword ?? '');
  if (!currentPassword) {
    throw badRequest('Password verification failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is required.' });
  }
  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    throw badRequest('Password verification failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await savePasswordResetToken({
    email: user.email,
    tokenHash: sha256(otp),
    expiresAt: new Date(Date.now() + PASSWORD_CHANGE_OTP_TTL_MS),
    attempts: 0,
    createdAt: new Date(),
  });

  await sendPasswordResetOtp(user.email, otp);
  await audit(req, 'PASSWORD_CHANGE_OTP_CREATED', { email: user.email }, 'user', user.uuid, user.id);
  return { message: PASSWORD_CHANGE_OTP_MESSAGE };
};

const readPasswordChangeCode = (input: ChangePasswordInput): string =>
  String(input.verificationCode ?? input.otp ?? input.token ?? '').trim();

export const changePassword = async (userId: number, input: ChangePasswordInput, req?: Request): Promise<void> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const currentPassword = String(input.currentPassword ?? '');
  const newPassword = String(input.newPassword ?? '');
  const verificationCode = readPasswordChangeCode(input);

  const errors: Record<string, string> = {};
  if (!currentPassword) errors.currentPassword = 'Current password is required.';
  if (!newPassword) errors.newPassword = 'New password is required.';
  else if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_POLICY_MESSAGE;
  if (!verificationCode) errors.verificationCode = 'Email verification code is required.';
  if (Object.keys(errors).length > 0) throw badRequest('Password change validation failed.', 'VALIDATION_ERROR', errors);

  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  const isSameAsCurrentPassword = await argon2.verify(user.passwordHash, newPassword);
  if (isSameAsCurrentPassword) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { newPassword: 'New password must be different from your current password.' });
  }

  const otpRecord = await getPasswordResetTokenByEmail(user.email);
  if (!otpRecord || otpRecord.expiresAt.getTime() <= Date.now()) {
    if (otpRecord) await removePasswordResetToken(user.email);
    throw badRequest(PASSWORD_CHANGE_OTP_INVALID, 'PASSWORD_CHANGE_OTP_INVALID', { verificationCode: PASSWORD_CHANGE_OTP_INVALID });
  }

  if (otpRecord.tokenHash !== sha256(verificationCode)) {
    otpRecord.attempts += 1;
    if (otpRecord.attempts >= MAX_PASSWORD_CHANGE_OTP_ATTEMPTS) {
      await removePasswordResetToken(user.email);
      throw tooManyRequests('Too many invalid verification code attempts. Please request a new code.');
    }
    await savePasswordResetToken(otpRecord);
    throw badRequest(PASSWORD_CHANGE_OTP_INVALID, 'PASSWORD_CHANGE_OTP_INVALID', { verificationCode: PASSWORD_CHANGE_OTP_INVALID });
  }

  user.passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
  await updateUser(user);
  await removePasswordResetToken(user.email);
  await audit(req, 'PASSWORD_CHANGED', { emailVerified: true }, 'user', user.uuid, user.id);
};