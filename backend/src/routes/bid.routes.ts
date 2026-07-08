import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { rateLimitHandler } from '../middleware/rateLimit.middleware';
import {
  bidderAutoBids,
  bidderBids,
  createAutoBid,
  createBid,
  deleteAutoBid,
  listListingBids,
  myAutoBidForListing,
} from '../controllers/bid.controller';

const router: Router = Router();
const bidLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', handler: rateLimitHandler('RATE_LIMIT_BID') });

router.post('/', bidLimiter, asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(createBid));
router.get('/bidder', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(bidderBids));
router.get('/auto-bids', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(bidderAutoBids));
router.post('/auto-bids', bidLimiter, asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(createAutoBid));
router.get('/auto-bids/:listingId', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(myAutoBidForListing));
router.delete('/auto-bids/:listingId', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(deleteAutoBid));
router.get('/listings/:listingId', asyncHandler(listListingBids));

export default router;
