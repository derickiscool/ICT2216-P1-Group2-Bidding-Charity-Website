import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../utils/errors';
import { sha256 } from '../utils/security';
import { audit } from '../services/audit.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) return next();
  const submitted = req.header('x-csrf-token');
  if (!submitted || !req.csrfToken || sha256(submitted) !== req.csrfToken) {
    // FSR16 req 2: CSRF failures are access-control violations and must be in the DB audit trail.
    void audit(req, 'CSRF_VALIDATION_FAILED', {
      path: req.originalUrl,
      hasToken: !!submitted,
    }, 'session', req.sessionId, req.user?.id);
    return next(forbidden('CSRF validation failed', 'CSRF_FAILED'));
  }
  return next();
};
