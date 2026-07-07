import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { listMine, viewReceipt } from '../controllers/receipt.controller';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/mine', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(listMine));
router.get('/:uuid', asyncHandler(authenticate), asyncHandler(viewReceipt));

export default router;
