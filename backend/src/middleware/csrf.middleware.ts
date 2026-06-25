import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../utils/errors';
import { sha256 } from '../utils/security';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) return next();
  const submitted = req.header('x-csrf-token');
  if (!submitted || !req.csrfToken || sha256(submitted) !== req.csrfToken) {
    return next(forbidden('CSRF validation failed', 'CSRF_FAILED'));
  }
  return next();
};
