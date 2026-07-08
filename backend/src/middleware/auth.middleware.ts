import type { NextFunction, Request, Response } from 'express';
import { findUserById, toPublicUser } from '../repositories';
import { parseCookieHeader } from '../utils/security';
import { getSessionCookieName, issueRefreshedSessionToken, setSessionCookie, verifySessionToken } from '../services/session.service';
import { forbidden, unauthorised } from '../utils/errors';


const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/force-change-password',
]);

const assertPasswordChangeGate = (req: Request): void => {
  if (!req.user?.mustChangePassword) return;
  if (PASSWORD_CHANGE_ALLOWED_PATHS.has(req.originalUrl.split('?')[0])) return;
  throw forbidden('Password change is required before continuing.', 'PASSWORD_CHANGE_REQUIRED');
};

const getTokenFromRequest = (req: Request): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[getSessionCookieName()];
};

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) throw unauthorised();
    const verified = await verifySessionToken(token);
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) throw unauthorised();
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    // NFSR08 sliding inactivity window: replace an aging token so activity keeps
    // the session alive, up to the absolute expiry.
    const refreshed = issueRefreshedSessionToken(verified, user.roles);
    if (refreshed) setSessionCookie(res, refreshed);
    assertPasswordChangeGate(req);
    next();
  } catch (err) {
    next(err);
  }
};

export const authenticateOptional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) { next(); return; }
    const verified = await verifySessionToken(token);
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) { next(); return; }
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    const refreshed = issueRefreshedSessionToken(verified, user.roles);
    if (refreshed) setSessionCookie(res, refreshed);
    assertPasswordChangeGate(req);
    next();
  } catch {
    next();
  }
};
