import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { confirmDelivery, confirmShipping } from '../controllers/shipping.controller';

const router = Router();

// SFR15: donor confirms shipping details — transitions listing from 'sold' to 'shipped'
router.post('/:uuid/ship', asyncHandler(authenticate), requireCsrf, requireRole('donor'), asyncHandler(confirmShipping));

// SFR15: winning bidder confirms receipt — transitions listing from 'shipped' to 'delivered'
router.post('/:uuid/deliver', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(confirmDelivery));

export default router;
