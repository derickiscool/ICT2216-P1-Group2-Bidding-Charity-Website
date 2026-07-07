import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { adminStats, listAudit, listUsersController, toggleUserStatus } from '../controllers/admin.controller';

const router = Router();
router.get('/audit-events', asyncHandler(authenticate), requireRole('admin'), asyncHandler(listAudit));
router.get('/stats', asyncHandler(authenticate), requireRole('admin'), asyncHandler(adminStats));
router.get('/users', asyncHandler(authenticate), requireRole('admin'), asyncHandler(listUsersController));
router.patch('/users/:uuid/status', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(toggleUserStatus));
export default router;
