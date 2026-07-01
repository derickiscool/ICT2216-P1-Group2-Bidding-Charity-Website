import argon2 from 'argon2';
import type { Request } from 'express';
import { findUserById, findUserByUsername, toPublicUser, updateUser } from '../repositories';
import type { PublicUser } from '../repositories';
import { badRequest, notFound } from '../utils/errors';
import { safeString } from '../utils/security';
import { isStrongPassword } from '../utils/breachedPasswords';
import { audit } from './audit.service';

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

  const previous = { full_name: user.full_name, username: user.username, contact_number: user.contact_number };

  user.full_name = fullName;
  user.username = username;
  user.contact_number = contactNumber;

  await updateUser(user);
  await audit(req, 'PROFILE_UPDATED', { previous, updated: { full_name: fullName, username, contact_number: contactNumber } }, 'user', user.uuid, user.id);

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
  else if (!isStrongPassword(newPassword)) errors.newPassword = 'Password must be 8-128 characters and must not match known breached passwords.';
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
