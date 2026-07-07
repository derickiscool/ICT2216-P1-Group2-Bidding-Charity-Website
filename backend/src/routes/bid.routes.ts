import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  bidderAutoBids,
  bidderBids,
  createAutoBid,
  createBid,
  deleteAutoBid,
  listListingBids,
  myAutoBidForListing,
} from '../controllers/bid.controller';

const router = Router();
router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(createBid));
router.get('/bidder', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(bidderBids));
router.get('/auto-bids', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(bidderAutoBids));
router.post('/auto-bids', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(createAutoBid));
router.get('/auto-bids/:listingId', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(myAutoBidForListing));
router.delete('/auto-bids/:listingId', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(deleteAutoBid));
router.get('/listings/:listingId', asyncHandler(listListingBids));

export default router;