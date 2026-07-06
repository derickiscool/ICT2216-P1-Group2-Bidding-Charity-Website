import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { bidderBids, createBid, listListingBids } from '../controllers/bid.controller';

const router = Router();
router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(createBid));
router.get('/bidder', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(bidderBids));
router.get('/listings/:listingId', asyncHandler(listListingBids));
export default router;
