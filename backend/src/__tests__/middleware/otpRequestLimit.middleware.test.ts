import { afterEach, beforeEach, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { createOtpRequestLimiter } from '../../middleware/otpRequestLimit.middleware';

// express-rate-limit's own `skip` check for NODE_ENV==='test' would otherwise make
// this limiter a no-op under Jest (which sets NODE_ENV=test by default) — flip it
// the same way session.service.test.ts does for its own NODE_ENV-dependent checks.
describe('createOtpRequestLimiter', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const fakeReqRes = (email: string) => {
    const req = { body: { email }, ip: '127.0.0.1', headers: {} } as unknown as Request;
    const res = { setHeader: () => undefined, getHeader: () => undefined } as unknown as Response;
    return { req, res };
  };

  const run = (middleware: ReturnType<typeof createOtpRequestLimiter>, email: string): Promise<unknown> =>
    new Promise((resolve) => {
      const { req, res } = fakeReqRes(email);
      const next: NextFunction = (err?: unknown) => resolve(err);
      void middleware(req, res, next);
    });

  test('allows requests up to the limit, then throws a 429 RATE_LIMITED AppError', async () => {
    const limiter = createOtpRequestLimiter({ windowMs: 60_000, limit: 3 });
    const email = 'spammed@example.com';

    for (let i = 0; i < 3; i += 1) {
      const err = await run(limiter, email);
      assert.equal(err, undefined, `request ${i + 1} should pass through`);
    }

    const err = await run(limiter, email);
    assert.ok(err instanceof AppError);
    assert.equal((err as AppError).statusCode, 429);
    assert.equal((err as AppError).code, 'RATE_LIMITED');
  });

  test('tracks separate targets independently', async () => {
    const limiter = createOtpRequestLimiter({ windowMs: 60_000, limit: 1 });

    const firstErr = await run(limiter, 'victim-a@example.com');
    assert.equal(firstErr, undefined);
    const secondErr = await run(limiter, 'victim-a@example.com');
    assert.ok(secondErr instanceof AppError, 'a second request for the same email should be throttled');

    const otherErr = await run(limiter, 'victim-b@example.com');
    assert.equal(otherErr, undefined, 'a different email must not be affected by another email exhausting its limit');
  });
});
