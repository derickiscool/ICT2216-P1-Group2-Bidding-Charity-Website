import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../types/domain';
import { forbidden } from '../utils/errors';
import { audit } from '../services/audit.service';

export const requireRole = (...roles: UserRole[]) => async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user || !req.user.roles.some(role => roles.includes(role))) {
    await audit(req, 'ACCESS_DENIED', { requiredRoles: roles, actualRoles: req.user?.roles ?? [], path: req.originalUrl }, 'route');
    return next(forbidden('Access denied'));
  }
  return next();
};
