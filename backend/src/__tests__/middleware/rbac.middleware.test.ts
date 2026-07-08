import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import {
  evaluateRoleAccess,
  requireRole,
  RBAC_DECISION_BUDGET_MS,
} from '../../middleware/rbac.middleware';

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
});
