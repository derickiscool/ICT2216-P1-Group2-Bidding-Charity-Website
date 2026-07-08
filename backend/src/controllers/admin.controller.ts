import type { Request, Response } from 'express';
import { listUsers, toPublicUser, updateUser } from '../repositories';
import { getAdminStats, getAuditEvents } from '../services/audit.service';
import { audit } from '../services/audit.service';
import { badRequest, notFound } from '../utils/errors';

export const listAudit = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getAuditEvents());
};

export const adminStats = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getAdminStats());
};

export const listUsersController = async (_req: Request, res: Response): Promise<void> => {
  const users = await listUsers();
  res.json(users.map(u => toPublicUser(u)));
};

export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;
  const newStatus = req.body.is_active;
  if (typeof newStatus !== 'boolean') throw badRequest('is_active must be a boolean value.');

  if (uuid === req.user?.uuid) throw badRequest('Administrators cannot change their own account status.', 'SELF_ACTION_FORBIDDEN');

  const { findUserByUuid } = await import('../repositories');
  const user = await findUserByUuid(uuid);
  if (!user) throw notFound('User not found');

  user.is_active = newStatus;
  await updateUser(user);
  await audit(req, newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', { uuid }, 'user', uuid, req.user?.id);
  res.json(toPublicUser(user));
};
