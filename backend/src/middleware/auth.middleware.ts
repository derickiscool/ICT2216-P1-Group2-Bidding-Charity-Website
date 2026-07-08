import type { NextFunction, Request, Response } from 'express';
import { findUserById, toPublicUser } from '../repositories';
import { parseCookieHeader } from '../utils/security';
import { getSessionCookieName, issueRefreshedSessionToken, setSessionCookie, verifySessionToken } from '../services/session.service';
import { audit } from '../services/audit.service';
import { forbidden, unauthorised } from '../utils/errors';

const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/force-change-password',
]);

const assertPasswordChangeGate = async (req: Request): Promise<void> => {
  if (!req.user?.mustChangePassword) return;
  if (PASSWORD_CHANGE_ALLOWED_PATHS.has(req.originalUrl.split('?')[0])) return;
  await audit(req, 'PRIVILEGE_ESCALATION_BLOCKED', {
    path: req.originalUrl,
    reason: 'must_change_password',
    userId: req.user.id,
  }, 'user', req.user.uuid, req.user.id);
  throw forbidden('Password change is required before continuing.', 'PASSWORD_CHANGE_REQUIRED');
};

const getTokenFromRequest = (req: Request): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[getSessionCookieName()];
};

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    // NFSR08 sliding inactivity window: replace an aging token so activity keeps
    // the session alive, up to the absolute expiry.
    const refreshed = issueRefreshedSessionToken(verified, user.roles);
    if (refreshed) setSessionCookie(res, refreshed);
    await assertPasswordChangeGate(req);
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
    await assertPasswordChangeGate(req);
    next();
  } catch {
    next();
  }
};
