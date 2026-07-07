import argon2 from 'argon2';
import type { Request } from 'express';
import {
  addUser, findUserByEmail, findUserByUsername, findUserByUuid, getCharityByOwnerUserId,
  listStaffByCharityId, toPublicUser, updateUser, type PublicUser
} from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { isStrongPassword } from '../utils/breachedPasswords';
import { isValidEmail, safeString, sanitizeText } from '../utils/security';
import { audit } from './audit.service';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };

interface ValidatedStaffFields {
  fullName: string;
  email: string;
  username: string;
}

const resolveOwnedCharity = async (req: Request) => {
  if (!req.user) throw badRequest('Authentication required');
  const charity = await getCharityByOwnerUserId(req.user.id);
  if (!charity) throw forbidden('No charity organisation is linked to this account.', 'CHARITY_NOT_LINKED');
  return charity;
};

const requireApprovedCharity = (charity: { status: string }): void => {
  if (charity.status !== 'approved') {
    throw forbidden('Your organisation account must be approved before managing staff accounts.', 'CHARITY_NOT_APPROVED');
  }
};

const validateStaffFields = (body: Record<string, unknown>): ValidatedStaffFields => {
  const errors: Record<string, string> = {};
  const fullName = sanitizeText(body.full_name, 80);
  const email = safeString(body.email, 254).toLowerCase();
  const username = safeString(body.username, 30);

  if (fullName.length < 2) errors.full_name = 'Full name must be at least 2 characters.';
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) errors.username = 'Username must be 3-30 characters using letters, numbers, and underscores.';
  if (Object.keys(errors).length > 0) throw badRequest('Staff input failed validation.', 'VALIDATION_ERROR', errors);

  return { fullName, email, username };
};

const assertEmailAndUsernameAvailable = async (email: string, username: string, excludeUserId?: number): Promise<void> => {
  const existingEmail = await findUserByEmail(email);
  if (existingEmail && existingEmail.id !== excludeUserId) {
    throw badRequest('This email is already used by another account.', 'VALIDATION_ERROR', { email: 'This email is already used by another account.' });
  }
  const existingUsername = await findUserByUsername(username);
  if (existingUsername && existingUsername.id !== excludeUserId) {
    throw badRequest('This username is already used by another account.', 'VALIDATION_ERROR', { username: 'This username is already used by another account.' });
  }
};

const findOwnedStaffByUuid = async (charityId: number, uuid: string) => {
  const target = await findUserByUuid(uuid);
  if (!target || target.charityId !== charityId || !target.roles.includes('charity_staff')) {
    throw notFound('Staff account not found.');
  }
  return target;
};

export const listManagedStaff = async (req: Request): Promise<{ staff: PublicUser[]; canManageStaff: boolean }> => {
  if (!req.user) throw badRequest('Authentication required');
  const charity = await getCharityByOwnerUserId(req.user.id);
  if (!charity) return { staff: [], canManageStaff: false };
  const staff = await listStaffByCharityId(charity.id);
  return { staff: staff.map(toPublicUser), canManageStaff: charity.status === 'approved' };
};

export const createManagedStaff = async (req: Request): Promise<PublicUser> => {
  const charity = await resolveOwnedCharity(req);
  requireApprovedCharity(charity);
  const { fullName, email, username } = validateStaffFields(req.body);

  const temporaryPassword = String(req.body.temporaryPassword ?? '');
  if (!isStrongPassword(temporaryPassword)) {
    throw badRequest('Staff input failed validation.', 'VALIDATION_ERROR', {
      temporaryPassword: 'Temporary password must be 8-128 characters and must not match known breached or common passwords.'
    });
  }

  await assertEmailAndUsernameAvailable(email, username);

  const passwordHash = await argon2.hash(temporaryPassword, ARGON2_OPTIONS);
  const user = await addUser({
    email, username, full_name: fullName, roles: ['charity_staff'], passwordHash, is_verified: true, charityId: charity.id
  });
  await audit(req, 'CHARITY_STAFF_CREATED', { email, username }, 'user', user.uuid, req.user!.id);
  return toPublicUser(user);
};

export const updateManagedStaff = async (req: Request, staffUuid: string): Promise<PublicUser> => {
  const charity = await resolveOwnedCharity(req);
  requireApprovedCharity(charity);
  const target = await findOwnedStaffByUuid(charity.id, staffUuid);
  const { fullName, email, username } = validateStaffFields(req.body);

  await assertEmailAndUsernameAvailable(email, username, target.id);

  target.full_name = fullName;
  target.email = email;
  target.username = username;
  await updateUser(target);
  await audit(req, 'CHARITY_STAFF_UPDATED', { email, username }, 'user', target.uuid, req.user!.id);
  return toPublicUser(target);
};

export const deactivateManagedStaff = async (req: Request, staffUuid: string): Promise<PublicUser> => {
  const charity = await resolveOwnedCharity(req);
  requireApprovedCharity(charity);
  const target = await findOwnedStaffByUuid(charity.id, staffUuid);

  target.is_active = false;
  await updateUser(target);
  await audit(req, 'CHARITY_STAFF_DEACTIVATED', {}, 'user', target.uuid, req.user!.id);
  return toPublicUser(target);
};
