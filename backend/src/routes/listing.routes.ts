import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadListingImages } from '../middleware/upload.middleware';
import {
  adminListings,
  approve,
  confirmDeliveryHandler,
  create,
  donorListings,
  forceClose,
  getListing,
  listActive,
  listMine,
  listMineTracking,
  pending,
  reject,
  requestChanges,
  remove,
  shipping,
  update,
} from '../controllers/listing.controller';
import { listCharityReviewListings, reviewCharityListing } from '../controllers/listingReview.controller';

const router = Router();

// Public auction browsing endpoint
router.get('/', asyncHandler(listActive));

router.get('/donor', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(donorListings));
router.get('/mine/tracking', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMineTracking));
router.get('/mine', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMine));
router.get('/admin/pending', asyncHandler(authenticate), requireRole('admin'), asyncHandler(pending));
router.get('/admin/all', asyncHandler(authenticate), requireRole('admin'), asyncHandler(adminListings));
router.get('/charity/review', asyncHandler(authenticate), requireRole('charity', 'charity_staff'), asyncHandler(listCharityReviewListings));

// Separation of duties: only donors may create listings. Admins review them (approve/reject/
// request-changes) but must not author listings they can also moderate.
router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('donor'), uploadListingImages, asyncHandler(create));
router.patch('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), uploadListingImages, asyncHandler(update));
router.delete('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(remove));

router.post('/:uuid/approve', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(approve));
router.post('/:uuid/charity-review', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'charity_staff'), asyncHandler(reviewCharityListing));
router.post('/:uuid/reject', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(reject));
router.post('/:uuid/request-changes', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(requestChanges));
router.post('/:uuid/force-close', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(forceClose));
router.post('/:uuid/shipping', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(shipping));
router.post('/:uuid/confirm-delivery', asyncHandler(authenticate), requireCsrf, requireRole('bidder', 'admin'), asyncHandler(confirmDeliveryHandler));
router.get('/:uuid', asyncHandler(authenticateOptional), asyncHandler(getListing));

export default router;
