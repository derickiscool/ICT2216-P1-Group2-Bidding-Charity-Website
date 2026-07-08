import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import {
  assertJwtLifetimeWithinIdleLimit,
  getJwtSecret,
  issueRefreshedSessionToken,
  SESSION_ABSOLUTE_TIMEOUT_MINUTES,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_JWT_ALGORITHM,
  SESSION_REFRESH_THRESHOLD_MS,
  type VerifiedSession,
} from '../../services/session.service';

const baseSession = (overrides: Partial<VerifiedSession> = {}): VerifiedSession => ({
  userId: 7,
  sid: 'sid-under-test',
  jti: 'jti-under-test',
  csrfTokenHash: 'csrf-hash',
  issuedAtMs: Date.now(),
  absoluteExpiresAtMs: Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS,
  ...overrides,
});

const decodeToken = (token: string) => {
  const decoded = jwt.decode(token, { complete: true });
  assert.ok(decoded, 'refreshed token must decode');
  return { header: decoded.header, payload: decoded.payload as JwtPayload };
};

describe('getJwtSecret', () => {
  test('throws when production JWT_SECRET is missing or too short', () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.JWT_SECRET = 'short';
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    process.env.NODE_ENV = oldNodeEnv;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
});

describe('NFSR08 session token limits', () => {
  test('uses HS256, a 15 minute inactivity limit, and a 30 minute absolute cap', () => {
    assert.equal(SESSION_JWT_ALGORITHM, 'HS256');
    assert.equal(SESSION_IDLE_TIMEOUT_MINUTES, 15);
    assert.equal(SESSION_ABSOLUTE_TIMEOUT_MINUTES, 30);
  });

  test('accepts JWT payloads within the inactivity limit', () => {
    assert.doesNotThrow(() => assertJwtLifetimeWithinIdleLimit({ iat: 1000, exp: 1900 }));
  });

  test('rejects JWT payloads that exceed the inactivity limit', () => {
    assert.throws(
      () => assertJwtLifetimeWithinIdleLimit({ iat: 1000, exp: 2000 }),
      /Authentication required/,
    );
  });

  test('rejects JWT payloads without immutable issued and expiry timestamps', () => {
    assert.throws(
      () => assertJwtLifetimeWithinIdleLimit({ sub: '1' }),
      /Authentication required/,
    );
  });
});

describe('NFSR08 sliding inactivity refresh', () => {
  test('does not reissue a token still in the first half of its window', () => {
    const token = issueRefreshedSessionToken(baseSession(), ['bidder']);
    assert.equal(token, undefined);
  });

  test('reissues an aging token for the same session with a fresh 15 minute window', () => {
    const session = baseSession({ issuedAtMs: Date.now() - SESSION_REFRESH_THRESHOLD_MS - 1000 });
    const token = issueRefreshedSessionToken(session, ['bidder']);
    assert.ok(token, 'a token past half its window must be reissued');

    const { header, payload } = decodeToken(token);
    assert.equal(header.alg, 'HS256');
    assert.equal(payload.sid, session.sid);
    assert.equal(payload.jti, session.jti);
    assert.equal(payload.sub, String(session.userId));

    const lifetimeSeconds = (payload.exp ?? 0) - (payload.iat ?? 0);
    assert.equal(lifetimeSeconds, SESSION_IDLE_TIMEOUT_MS / 1000);
    // The reissued token must itself satisfy the strict lifetime check.
    assert.doesNotThrow(() => assertJwtLifetimeWithinIdleLimit(payload));
  });

  test('caps the refreshed lifetime at the session absolute expiry', () => {
    const session = baseSession({
      issuedAtMs: Date.now() - SESSION_REFRESH_THRESHOLD_MS - 1000,
      absoluteExpiresAtMs: Date.now() + 60 * 1000,
    });
    const token = issueRefreshedSessionToken(session, ['bidder']);
    assert.ok(token);

    const { payload } = decodeToken(token);
    const lifetimeSeconds = (payload.exp ?? 0) - (payload.iat ?? 0);
    assert.ok(lifetimeSeconds <= 60, `lifetime ${lifetimeSeconds}s must not outlive the absolute expiry`);
  });

  test('does not reissue once the absolute expiry has passed', () => {
    const session = baseSession({
      issuedAtMs: Date.now() - SESSION_REFRESH_THRESHOLD_MS - 1000,
      absoluteExpiresAtMs: Date.now() - 1,
    });
    assert.equal(issueRefreshedSessionToken(session, ['bidder']), undefined);
  });
});
