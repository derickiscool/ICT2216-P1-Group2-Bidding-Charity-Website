import crypto from 'crypto';
import type { Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { addSession, getSession, revokeSession, updateSession } from '../repositories/inMemory.repository';
import type { SessionRecord, User } from '../types/domain';
import { randomToken, sha256 } from '../utils/security';
import { unauthorised } from '../utils/errors';

const ISSUER = 'bidforgood';
const AUDIENCE = 'bidforgood-web';
const SESSION_MINUTES = 15;
const devJwtSecret = crypto.randomBytes(32).toString('hex');

export interface CreatedSession {
  token: string;
  csrfToken: string;
  sid: string;
}

export interface VerifiedSession {
  userId: number;
  sid: string;
  jti: string;
  csrfTokenHash: string;
}

export const getSessionCookieName = (): string => process.env.NODE_ENV === 'production' ? '__Host-bfg_session' : 'bfg_session';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
    }
    return devJwtSecret;
  }
  return secret;
};

export const createSession = async (user: Omit<User, 'passwordHash'>): Promise<CreatedSession> => {
  const secret = getJwtSecret();
  const sid = crypto.randomUUID();
  const jti = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
  const record: SessionRecord = {
    sid,
    userId: user.id,
    jtiHash: sha256(jti),
    csrfTokenHash: sha256(csrfToken),
    expiresAt,
    createdAt: new Date(),
    lastSeenAt: new Date()
  };
  await addSession(record);
  const token = jwt.sign({ sub: String(user.id), sid, role: user.roles[0], roles: user.roles, jti }, secret, {
    algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, expiresIn: `${SESSION_MINUTES}m`
  });
  return { token, csrfToken, sid };
};

export const setSessionCookie = (res: Response, token: string): void => {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(getSessionCookieName(), token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MINUTES * 60 * 1000
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(getSessionCookieName(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
};

export const verifySessionToken = async (token: string): Promise<VerifiedSession> => {
  const secret = getJwtSecret();
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    throw unauthorised('Authentication required');
  }
  if (!decoded.sid || !decoded.jti || !decoded.sub) throw unauthorised('Authentication required');
  const record = await getSession(String(decoded.sid));
  if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) throw unauthorised('Authentication required');
  if (record.jtiHash !== sha256(String(decoded.jti))) throw unauthorised('Authentication required');
  record.lastSeenAt = new Date();
  record.expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
  await updateSession(record);
  return { userId: Number(decoded.sub), sid: String(decoded.sid), jti: String(decoded.jti), csrfTokenHash: record.csrfTokenHash };
};

export const revokeBySid = async (sid: string): Promise<void> => revokeSession(sid);
