import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  evaluateRoleAccess,
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
});
