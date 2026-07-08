import { afterEach, describe, jest, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { errorHandler, notFoundHandler } from '../../middleware/error.middleware';
import { badRequest } from '../../utils/errors';

// NFSR12: unhandled errors must be intercepted quickly, stack traces stripped from
// the client response, a standardized JSON schema returned, and the full trace
// routed to the internal log stream instead.
const NFSR12_BUDGET_MS = 20;

type CapturedResponse = {
  statusCode?: number;
  body?: unknown;
  res: Response;
};

const makeRes = (): CapturedResponse => {
  const captured: CapturedResponse = { res: undefined as unknown as Response };
  captured.res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  return captured;
};

const noopNext: NextFunction = () => undefined;
const fakeReq = { path: '/api/some/path' } as unknown as Request;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NFSR12 — unhandled error interception', () => {
  test('returns the standardized JSON schema with no stack trace or internal detail', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('database exploded at connection pool');
    const captured = makeRes(); const { res } = captured;

    errorHandler(boom, fakeReq, res, noopNext);

    assert.equal(captured.statusCode, 500);
    assert.deepEqual(captured.body, { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });

    const serialized = JSON.stringify(captured.body);
    assert.ok(!serialized.includes('database exploded'), 'internal error message leaked to the client');
    assert.ok(!/\bat\s+\w+/.test(serialized), 'stack frames leaked to the client');

    // The full trace must still reach the internal log stream.
    assert.equal(consoleError.mock.calls.length, 1);
    const loggedError = consoleError.mock.calls[0][1] as Error;
    assert.equal(loggedError, boom);
    assert.ok(loggedError.stack?.includes('error.middleware.test'), 'full stack trace must be logged internally');
  });

  test('serves application errors with their own status, code, and field details', () => {
    const err = badRequest('Campaign input failed validation.', 'VALIDATION_ERROR', { name: 'Too short.' });
    const captured = makeRes(); const { res } = captured;

    errorHandler(err, fakeReq, res, noopNext);

    assert.equal(captured.statusCode, 400);
    assert.deepEqual(captured.body, {
      message: 'Campaign input failed validation.',
      code: 'VALIDATION_ERROR',
      errors: { name: 'Too short.' },
    });
  });

  test('maps upload errors to 400 with the multer code', () => {
    const err = new MulterError('LIMIT_FILE_SIZE', 'images');
    const captured = makeRes(); const { res } = captured;

    errorHandler(err, fakeReq, res, noopNext);

    assert.equal(captured.statusCode, 400);
    assert.deepEqual(captured.body, { message: 'File too large', code: 'LIMIT_FILE_SIZE' });
  });

  test('classifies body-parser failures as client errors without logging them as unhandled', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const malformed = Object.assign(new SyntaxError('Unexpected token , in JSON at position 18'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const malformedCaptured = makeRes();
    errorHandler(malformed, fakeReq, malformedCaptured.res, noopNext);
    assert.equal(malformedCaptured.statusCode, 400);
    assert.deepEqual(malformedCaptured.body, {
      message: 'The request body could not be processed.',
      code: 'ENTITY_PARSE_FAILED',
    });

    const oversized = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    const oversizedCaptured = makeRes();
    errorHandler(oversized, fakeReq, oversizedCaptured.res, noopNext);
    assert.equal(oversizedCaptured.statusCode, 413);
    assert.deepEqual(oversizedCaptured.body, {
      message: 'The request body exceeds the allowed size.',
      code: 'ENTITY_TOO_LARGE',
    });

    assert.equal(consoleError.mock.calls.length, 0, 'client errors must not hit the unhandled-error log');
  });

  test('intercepts an unhandled error within the 20 millisecond budget', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const samples: number[] = [];
    for (let run = 0; run < 200; run += 1) {
      const { res } = makeRes();
      const start = performance.now();
      errorHandler(new Error(`unhandled failure ${run}`), fakeReq, res, noopNext);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    assert.ok(median < NFSR12_BUDGET_MS, `errorHandler median ${median.toFixed(4)}ms exceeds ${NFSR12_BUDGET_MS}ms`);
  });

  test('unknown routes get the standardized 404 shape', () => {
    const captured = makeRes(); const { res } = captured;
    notFoundHandler(fakeReq, res);
    assert.equal(captured.statusCode, 404);
    assert.deepEqual(captured.body, { message: 'Not found', path: '/api/some/path' });
  });
});
