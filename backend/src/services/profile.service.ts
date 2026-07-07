import crypto from 'crypto';
import argon2 from 'argon2';
import type { Request } from 'express';
import {
  findUserById, findUserByUsername, findUserByEmail, toPublicUser, updateUser,
  saveEmailChangeRequest, getEmailChangeRequest, removeEmailChangeRequest, revokeAllSessionsByUserId,
} from '../repositories';
import type { PublicUser } from '../repositories';
import { badRequest, notFound, tooManyRequests } from '../utils/errors';
import { safeString, normalizeEmail, isValidEmail, sha256 } from '../utils/security';
import { isStrongPassword } from '../utils/breachedPasswords';
import { audit } from './audit.service';
import { sendEmailChangeOtp, sendEmailChangeConfirmOtp } from './otpDelivery.service';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export interface UpdateProfileInput {
  full_name?: unknown;
  username?: unknown;
  contact_number?: unknown;
}

const CONTACT_NUMBER_RE = /^\+?[\d\s\-()​]{7,20}$/;

const isValidContactNumber = (value: string): boolean => {
  const digits = value.replace(/\D/g, '');
  return CONTACT_NUMBER_RE.test(value) && digits.length >= 7 && digits.length <= 15;
};

export const updateProfile = async (userId: number, input: UpdateProfileInput, req?: Request): Promise<PublicUser> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const errors: Record<string, string> = {};

  const fullName = safeString(input.full_name, 120);
  if (fullName.length < 2) errors.full_name = 'Full name must be at least 2 characters.';

  const username = safeString(input.username, 40);
  if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
    errors.username = 'Username must be 3-40 characters using letters, numbers, or underscores.';
  }

  const rawContact = safeString(input.contact_number, 20);
  const contactNumber = rawContact.length > 0 ? rawContact : undefined;
  if (contactNumber !== undefined && !isValidContactNumber(contactNumber)) {
    errors.contact_number = 'Contact number must be 7-15 digits and may include +, spaces, dashes, or parentheses.';
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

export interface ChangePasswordInput {
  currentPassword?: unknown;
  newPassword?: unknown;
}

export const changePassword = async (userId: number, input: ChangePasswordInput, req?: Request): Promise<void> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const currentPassword = String(input.currentPassword ?? '');
  const newPassword = String(input.newPassword ?? '');

  const errors: Record<string, string> = {};
  if (!currentPassword) errors.currentPassword = 'Current password is required.';
  if (!newPassword) errors.newPassword = 'New password is required.';
  else if (!isStrongPassword(newPassword)) errors.newPassword = 'Password must be 8-128 characters and must not match known breached, common, or dictionary passwords.';
  if (Object.keys(errors).length > 0) throw badRequest('Password change validation failed.', 'VALIDATION_ERROR', errors);

  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  const isSameAsCurrentPassword = await argon2.verify(user.passwordHash, newPassword);
  if (isSameAsCurrentPassword) {
    throw badRequest('Password change failed.', 'VALIDATION_ERROR', { newPassword: 'New password must be different from your current password.' });
  }

  user.passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
  await updateUser(user);
  await audit(req, 'PASSWORD_CHANGED', {}, 'user', user.uuid, user.id);
};

// SFR03 verified email change (OWASP no-MFA, sequential current-first confirmation):
// 1. requestEmailChange     — re-auth with current password; send a code to the CURRENT address only.
// 2. verifyCurrentEmail...  — confirm that code; ONLY THEN issue a code to the NEW address.
// 3. confirmEmailChange     — confirm the new-address code; apply the change and revoke all sessions.
// Deferring contact with the (possibly attacker-chosen) new address until current control is
// proven is the anti-abuse property this ordering buys over sending both codes up front.
const EMAIL_CHANGE_TTL_MS = 15 * 60 * 1000;
const MAX_EMAIL_CHANGE_ATTEMPTS = 5;

const genOtp = (): string => crypto.randomInt(100000, 1000000).toString();

export interface RequestEmailChangeInput {
  newEmail?: unknown;
  currentPassword?: unknown;
}

export const requestEmailChange = async (userId: number, input: RequestEmailChangeInput, req?: Request): Promise<{ message: string }> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const currentPassword = String(input.currentPassword ?? '');
  const newEmail = normalizeEmail(String(input.newEmail ?? ''));

  // Re-authentication gate — sensitive field change requires the current password.
  if (!currentPassword) {
    throw badRequest('Email change validation failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is required.' });
  }
  const currentOk = await argon2.verify(user.passwordHash, currentPassword);
  if (!currentOk) {
    await audit(req, 'EMAIL_CHANGE_REAUTH_FAILED', {}, 'user', user.uuid, user.id);
    throw badRequest('Email change failed.', 'VALIDATION_ERROR', { currentPassword: 'Current password is incorrect.' });
  }

  const errors: Record<string, string> = {};
  if (!isValidEmail(newEmail)) errors.newEmail = 'Enter a valid email address.';
  else if (newEmail === normalizeEmail(user.email)) errors.newEmail = 'New email must be different from your current email.';
  if (Object.keys(errors).length > 0) throw badRequest('Email change validation failed.', 'VALIDATION_ERROR', errors);

  // Generic message to limit account enumeration if the address is already registered.
  if (await findUserByEmail(newEmail)) {
    throw badRequest('Email change failed.', 'VALIDATION_ERROR', { newEmail: 'This email cannot be used.' });
  }

  // Only the CURRENT address is contacted at this stage. The new-address code is not
  // generated until the user proves control of the current inbox (anti-abuse).
  const oldOtp = genOtp();
  await saveEmailChangeRequest({
    user_id: user.id,
    newEmail,
    oldEmail: normalizeEmail(user.email),
    oldEmailOtpHash: sha256(oldOtp),
    newEmailOtpHash: null,
    oldEmailConfirmed: false,
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    attempts: 0,
    createdAt: new Date(),
  });

  await sendEmailChangeConfirmOtp(normalizeEmail(user.email), oldOtp);
  await audit(req, 'EMAIL_CHANGE_REQUESTED', { newEmail }, 'user', user.uuid, user.id);

  return { message: 'A verification code has been sent to your current email address.' };
};

export interface VerifyCurrentEmailInput {
  oldEmailOtp?: unknown;
}

export const verifyCurrentEmailForChange = async (userId: number, input: VerifyCurrentEmailInput, req?: Request): Promise<{ message: string }> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const invalid = badRequest('The verification code is invalid or has expired. Please start again.', 'EMAIL_CHANGE_OTP_INVALID');

  const request = await getEmailChangeRequest(user.id);
  if (!request || request.expiresAt.getTime() <= Date.now()) {
    if (request) await removeEmailChangeRequest(user.id);
    throw invalid;
  }
  if (request.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
    await removeEmailChangeRequest(user.id);
    throw tooManyRequests('Too many verification attempts. Please start again.');
  }

  const oldEmailOtp = String(input.oldEmailOtp ?? '');
  if (request.oldEmailOtpHash !== sha256(oldEmailOtp)) {
    request.attempts += 1;
    await audit(req, 'EMAIL_CHANGE_CURRENT_VERIFY_FAILED', { attempts: request.attempts }, 'user', user.uuid, user.id);
    if (request.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
      await removeEmailChangeRequest(user.id);
      throw tooManyRequests('Too many verification attempts. Please start again.');
    }
    await saveEmailChangeRequest(request);
    throw invalid;
  }

  // Current inbox proven — now (and only now) issue a code to the new address, with a
  // fresh attempt budget and window for the second stage.
  const newOtp = genOtp();
  request.oldEmailConfirmed = true;
  request.newEmailOtpHash = sha256(newOtp);
  request.attempts = 0;
  request.expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  await saveEmailChangeRequest(request);

  await sendEmailChangeOtp(request.newEmail, newOtp);
  await audit(req, 'EMAIL_CHANGE_CURRENT_VERIFIED', { newEmail: request.newEmail }, 'user', user.uuid, user.id);

  return { message: 'Your current email is confirmed. A verification code has been sent to your new email address.' };
};

export interface ConfirmEmailChangeInput {
  newEmailOtp?: unknown;
}

export const confirmEmailChange = async (userId: number, input: ConfirmEmailChangeInput, req?: Request): Promise<PublicUser> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  const invalid = badRequest('The verification code is invalid or has expired. Please start again.', 'EMAIL_CHANGE_OTP_INVALID');

  const request = await getEmailChangeRequest(user.id);
  if (!request || request.expiresAt.getTime() <= Date.now()) {
    if (request) await removeEmailChangeRequest(user.id);
    throw invalid;
  }
  // The new-address code only exists after the current address has been confirmed.
  if (!request.oldEmailConfirmed || !request.newEmailOtpHash) {
    throw badRequest('Please confirm your current email address first.', 'EMAIL_CHANGE_STEP_REQUIRED');
  }
  if (request.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
    await removeEmailChangeRequest(user.id);
    throw tooManyRequests('Too many verification attempts. Please start again.');
  }

  const newEmailOtp = String(input.newEmailOtp ?? '');
  if (request.newEmailOtpHash !== sha256(newEmailOtp)) {
    request.attempts += 1;
    await audit(req, 'EMAIL_CHANGE_VERIFY_FAILED', { attempts: request.attempts }, 'user', user.uuid, user.id);
    if (request.attempts >= MAX_EMAIL_CHANGE_ATTEMPTS) {
      await removeEmailChangeRequest(user.id);
      throw tooManyRequests('Too many verification attempts. Please start again.');
    }
    await saveEmailChangeRequest(request);
    throw invalid;
  }

  // Race guard: the address may have been claimed since the request was created.
  const taken = await findUserByEmail(request.newEmail);
  if (taken && taken.id !== user.id) {
    await removeEmailChangeRequest(user.id);
    throw badRequest('Email change failed.', 'VALIDATION_ERROR', { newEmail: 'This email cannot be used.' });
  }

  const previous = user.email;
  user.email = request.newEmail;
  await updateUser(user);
  await removeEmailChangeRequest(user.id);
  // OWASP: log the user out everywhere so they must re-authenticate with the new email.
  await revokeAllSessionsByUserId(user.id);
  await audit(req, 'EMAIL_CHANGED', { previous, updated: request.newEmail }, 'user', user.uuid, user.id);

  return toPublicUser(user);
};
