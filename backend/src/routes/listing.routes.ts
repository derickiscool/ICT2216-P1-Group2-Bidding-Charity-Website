import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadListingImages } from '../middleware/upload.middleware';
import {
  approve,
  create,
  getListing,
  listActive,
  listMine,
  listMineTracking,
  pending,
  remove,
  update,
} from '../controllers/listing.controller';
import { listCharityReviewListings, reviewCharityListing } from '../controllers/listingReview.controller';


const router = Router();

// Public auction browsing endpoint
router.get('/', asyncHandler(listActive));

router.get('/mine/tracking', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMineTracking));
router.get('/mine', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMine));
router.get('/admin/pending', asyncHandler(authenticate), requireRole('admin'), asyncHandler(pending));
router.get('/charity/review', asyncHandler(authenticate), requireRole('charity', 'charity_staff'), asyncHandler(listCharityReviewListings));

router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), uploadListingImages, asyncHandler(create));
router.patch('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), uploadListingImages, asyncHandler(update));
router.delete('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(remove));

router.post('/:uuid/approve', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(approve));
router.post('/:uuid/charity-review', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'charity_staff'), asyncHandler(reviewCharityListing));
router.get('/:uuid', asyncHandler(getListing));

export default router;