import type { NextFunction, Request, Response } from 'express';

export const requireHttpsInProduction = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_INSECURE_HTTP === 'true') {
    next();
    return;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim().toLowerCase();
  if (req.secure || forwardedProto === 'https') {
    next();
    return;
  }

  res.status(426).json({
    message: 'HTTPS is required.',
    code: 'HTTPS_REQUIRED',
  });
};
