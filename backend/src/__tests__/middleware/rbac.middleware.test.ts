import { describe, jest, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import {
  evaluateRoleAccess,
  requireRole,
  RBAC_DECISION_BUDGET_MS,
} from '../../middleware/rbac.middleware';

// The deny path writes an ACCESS_DENIED audit event; simulate the audit store being
// unavailable so these tests stay DB-free and prove denial still reaches the client.
jest.mock('../../services/audit.service', () => ({
  audit: jest.fn(async () => {
    throw new Error('audit store unavailable');
  }),
}));

describe('NFSR09 RBAC middleware decision checks', () => {
  test('allows users with at least one required role', () => {
    const decision = evaluateRoleAccess(['bidder', 'donor'], ['admin', 'donor']);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.actualRoles, ['bidder', 'donor']);
    assert.deepEqual(decision.requiredRoles, ['admin', 'donor']);
  });

  test('denies users without a required role', () => {
    const decision = evaluateRoleAccess(['bidder'], ['admin']);
    assert.equal(decision.allowed, false);
  });

  test('resolves repeated authorization decisions under 50 milliseconds each', () => {
    const decisions = Array.from({ length: 1000 }, () => evaluateRoleAccess(['bidder'], ['admin']));
    assert.ok(decisions.every(decision => decision.decisionMs < RBAC_DECISION_BUDGET_MS));
    assert.ok(decisions.every(decision => decision.withinBudget));
  });

  test('requireRole grants an authorized request within the latency budget and without I/O', async () => {
    // The allow path (the live-bidding hot path) must stay purely in-memory:
    // no audit write, no DB call — just the role-set check, then next().
    const middleware = requireRole('bidder');
    const req = { user: { roles: ['bidder'] } } as unknown as Request;
    const res = {} as Response;

    let nextError: unknown = 'not called';
    const next: NextFunction = (err?: unknown) => { nextError = err; };

    const start = performance.now();
    await middleware(req, res, next);
    const elapsedMs = performance.now() - start;

    assert.equal(nextError, undefined, 'next() must be called with no error for an authorized role');
    assert.ok(elapsedMs < RBAC_DECISION_BUDGET_MS, `middleware allow path took ${elapsedMs.toFixed(3)}ms`);
  });

  test('requireRole still denies the request when the audit trail write fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const middleware = requireRole('admin');
      const req = { user: { roles: ['bidder'] }, originalUrl: '/api/admin/audit-events' } as unknown as Request;

      let nextError: unknown = 'not called';
      const next: NextFunction = (err?: unknown) => { nextError = err; };
      await middleware(req, {} as Response, next);

      // Without the try/catch around audit(), this rejection would escape the
      // middleware and the request would hang with no response at all.
      assert.ok(nextError instanceof Error, 'next() must receive the forbidden error');
      assert.match((nextError as Error).message, /Access denied/);
      assert.equal(consoleError.mock.calls.length, 1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
