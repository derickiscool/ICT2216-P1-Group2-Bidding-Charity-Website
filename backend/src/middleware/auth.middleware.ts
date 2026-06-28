import type { NextFunction, Request, Response } from 'express';
import { findUserById, toPublicUser } from '../repositories/inMemory.repository';
import { parseCookieHeader } from '../utils/security';
import { getSessionCookieName, verifySessionToken } from '../services/session.service';
import { unauthorised } from '../utils/errors';

const getTokenFromRequest = (req: Request): string | undefined => {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[getSessionCookieName()];
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) throw unauthorised();
    const verified = await verifySessionToken(token);
    const user = await findUserById(verified.userId);
    if (!user || !user.is_active) throw unauthorised();
    req.user = toPublicUser(user);
    req.csrfToken = verified.csrfTokenHash;
    req.sessionId = verified.sid;
    next();
  } catch (err) {
    next(err);
  }
};
