import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';
import { audit } from '../services/audit.service';
import { writeSecurityLog } from '../services/securityLog.service';

export const notFoundHandler = (req: import('express').Request, res: import('express').Response): void => {
  res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
};

const auditRejectedRequest = async (
  req: import('express').Request,
  statusCode: number,
  code: string,
): Promise<void> => {
  const action = statusCode === 401
    ? 'SESSION_OR_AUTH_REJECTED'
    : statusCode === 403
      ? 'ACCESS_DENIED'
      : statusCode === 429
        ? 'RATE_LIMIT_REJECTED'
        : statusCode === 400
          ? 'INPUT_REJECTED'
          : undefined;

  if (!action) return;
  await audit(req, action, {
    code,
    method: req.method,
    path: req.originalUrl,
  }, 'route', undefined, req.user?.id).catch(() => undefined);
};

export const errorHandler: ErrorRequestHandler = async (err, req, res, _next) => {
  if (err instanceof AppError) {
    await auditRejectedRequest(req, err.statusCode, err.code);
    res.status(err.statusCode).json({ message: err.message, code: err.code, errors: err.details });
    return;
  }
  if (err instanceof MulterError) {
    await auditRejectedRequest(req, 400, err.code);
    res.status(400).json({ message: err.message, code: err.code });
    return;
  }
  await writeSecurityLog({
    type: 'UNHANDLED_BACKEND_ERROR',
    method: req.method,
    path: req.originalUrl,
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    actorUserId: req.user?.id,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  }).catch(() => undefined);
  res.status(500).json({ message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
};
