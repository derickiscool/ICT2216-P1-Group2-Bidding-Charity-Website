import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { patchProfile, putPassword, requestPasswordVerification } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';

const router = Router();
router.put('/profile', asyncHandler(authenticate), requireCsrf, asyncHandler(patchProfile));
router.post('/profile/password/verification', asyncHandler(authenticate), requireCsrf, asyncHandler(requestPasswordVerification));
router.put('/profile/password', asyncHandler(authenticate), requireCsrf, asyncHandler(putPassword));
export default router;