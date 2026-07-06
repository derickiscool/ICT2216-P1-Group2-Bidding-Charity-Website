import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { uploadListingImages } from '../middleware/upload.middleware';
import {
  approve,
  create,
  donorListings,
  forceClose,
  getListing,
  listActive,
  listMine,
  listMineTracking,
  pending,
  reject,
  remove,
  update,
} from '../controllers/listing.controller';

const router = Router();

// Public auction browsing endpoint
router.get('/', asyncHandler(listActive));

router.get('/donor', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(donorListings));
router.get('/mine/tracking', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMineTracking));
router.get('/mine', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(listMine));
router.get('/admin/pending', asyncHandler(authenticate), requireRole('admin'), asyncHandler(pending));

router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), uploadListingImages, asyncHandler(create));
router.patch('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), uploadListingImages, asyncHandler(update));
router.delete('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(remove));

router.post('/:uuid/approve', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(approve));
router.post('/:uuid/reject', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(reject));
router.post('/:uuid/force-close', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(forceClose));
router.get('/:uuid', asyncHandler(authenticateOptional), asyncHandler(getListing));

export default router;
