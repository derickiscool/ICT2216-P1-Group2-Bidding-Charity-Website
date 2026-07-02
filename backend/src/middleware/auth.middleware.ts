import type { NextFunction, Request, Response } from 'express';
import { findUserById, toPublicUser } from '../repositories';
import { parseCookieHeader } from '../utils/security';
import { getSessionCookieName, verifySessionToken } from '../services/session.service';
import { audit } from '../services/audit.service';
import { unauthorised } from '../utils/errors';

const getTokenFromRequest = (req: Request): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[getSessionCookieName()];
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      await audit(req, 'AUTH_SESSION_MISSING', { path: req.originalUrl });
      throw unauthorised();
    }
    let verified: Awaited<ReturnType<typeof verifySessionToken>>;
    try {
      verified = await verifySessionToken(token);
    } catch {
      await audit(req, 'AUTH_SESSION_INVALID', { path: req.originalUrl });
      throw unauthorised();
    }
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) {
      await audit(req, 'AUTH_SESSION_INVALID', { path: req.originalUrl, reason: 'user_not_found_or_inactive', sid: verified.sid });
      throw unauthorised();
    }
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    next();
  } catch (err) {
    next(err);
  }
};
