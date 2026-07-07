import type { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { listMine, viewReceipt, viewReceiptByPayment } from '../controllers/receipt.controller';
import { requireRole } from '../middleware/rbac.middleware';

const router = Router();

router.get('/mine', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(listMine));
router.get('/by-payment/:uuid', asyncHandler(authenticate), asyncHandler(viewReceiptByPayment));
router.get('/:uuid', asyncHandler(authenticate), asyncHandler(viewReceipt));

export default router;
