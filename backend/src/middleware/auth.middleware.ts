import type { NextFunction, Request, Response } from 'express';
import { findUserById, toPublicUser } from '../repositories';
import { parseCookieHeader } from '../utils/security';
import { getSessionCookieName, verifySessionToken } from '../services/session.service';
import { forbidden, unauthorised } from '../utils/errors';

const getTokenFromRequest = (req: Request): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[getSessionCookieName()];
};

const FIRST_LOGIN_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/force-change-password',
]);

const assertPasswordChangeAllowed = (req: Request, mustChangePassword: boolean): void => {
  if (!mustChangePassword) return;

  // Staff accounts are created with temporary passwords. Until the password is
  // changed, the authenticated session is intentionally limited to the small
  // first-login flow instead of normal charity/admin/business endpoints.
  const path = req.originalUrl.split('?')[0];
  if (!FIRST_LOGIN_ALLOWED_PATHS.has(path)) {
    throw forbidden('Password change required before continuing.', 'PASSWORD_CHANGE_REQUIRED');
  }
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) throw unauthorised();
    const verified = await verifySessionToken(token);
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) throw unauthorised();
    assertPasswordChangeAllowed(req, user.mustChangePassword);
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    next();
  } catch (err) {
    next(err);
  }
};

export const authenticateOptional = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) { next(); return; }
    const verified = await verifySessionToken(token);
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) { next(); return; }
    assertPasswordChangeAllowed(req, user.mustChangePassword);
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    next();
  } catch {
    next();
  }
};
