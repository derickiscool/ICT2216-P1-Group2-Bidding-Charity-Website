import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { listAudit } from '../controllers/admin.controller';

const router = Router();
router.get('/audit-events', asyncHandler(authenticate), requireRole('admin'), asyncHandler(listAudit));
export default router;
