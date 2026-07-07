import { performance } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../types/domain';
import { forbidden } from '../utils/errors';
import { audit } from '../services/audit.service';

export const RBAC_DECISION_BUDGET_MS = 50;

export interface RoleAccessDecision {
  allowed: boolean;
  actualRoles: UserRole[];
  requiredRoles: UserRole[];
  decisionMs: number;
  withinBudget: boolean;
}

export const evaluateRoleAccess = (
  actualRoles: readonly UserRole[] | undefined,
  requiredRoles: readonly UserRole[],
): RoleAccessDecision => {
  const start = performance.now();
  const required = new Set<UserRole>(requiredRoles);
  const actual = [...(actualRoles ?? [])];
  const allowed = actual.some(role => required.has(role));
  const decisionMs = performance.now() - start;
  return {
    allowed,
    actualRoles: actual,
    requiredRoles: [...requiredRoles],
    decisionMs,
    withinBudget: decisionMs <= RBAC_DECISION_BUDGET_MS,
  };
};

export const requireRole = (...roles: UserRole[]) => async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const decision = evaluateRoleAccess(req.user?.roles, roles);
  if (!decision.allowed) {
    await audit(req, 'ACCESS_DENIED', {
      requiredRoles: decision.requiredRoles,
      actualRoles: decision.actualRoles,
      path: req.originalUrl,
      decisionMs: Number(decision.decisionMs.toFixed(3)),
      withinBudget: decision.withinBudget,
    }, 'route');
    return next(forbidden('Access denied'));
  }
  return next();
};
