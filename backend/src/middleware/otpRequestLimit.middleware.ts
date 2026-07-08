import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { tooManyRequests } from '../utils/errors';
import { normalizeEmail } from '../utils/security';

interface OtpRequestLimiterOptions {
  windowMs: number;
  limit: number;
  keyOf?: (req: Request) => string;
}

const defaultKeyOf = (req: Request): string => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? normalizeEmail(email) : req.ip ?? 'unknown';
};

// Caps how often a single target (email, or account for the authenticated
// profile flow) can trigger a fresh OTP send, regardless of the requester's
// IP. The global per-IP limiter in app.ts is far too generous (120/min) to
// stop one IP from email-bombing a single victim across these routes.
export const createOtpRequestLimiter = ({ windowMs, limit, keyOf = defaultKeyOf }: OtpRequestLimiterOptions) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyOf,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req, _res, next) => {
      next(tooManyRequests('Too many requests for this email address. Please wait before trying again.'));
    },
  });
