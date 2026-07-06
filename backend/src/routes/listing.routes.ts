import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { approve, create, donorListings, getListing, listActive, pending, update } from '../controllers/listing.controller';

const router = Router();
router.get('/', asyncHandler(listActive));
router.get('/donor', asyncHandler(authenticate), requireRole('donor', 'admin'), asyncHandler(donorListings));
router.get('/:uuid', asyncHandler(authenticateOptional), asyncHandler(getListing));
router.post('/', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(create));
router.patch('/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('donor', 'admin'), asyncHandler(update));
router.get('/admin/pending', asyncHandler(authenticate), requireRole('admin'), asyncHandler(pending));
router.post('/:uuid/approve', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(approve));
export default router;
