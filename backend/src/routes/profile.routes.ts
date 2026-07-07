import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { patchProfile, putPassword, postEmailChangeRequest, postEmailChangeConfirm } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';

const router = Router();
router.put('/profile', asyncHandler(authenticate), requireCsrf, asyncHandler(patchProfile));
router.put('/profile/password', asyncHandler(authenticate), requireCsrf, asyncHandler(putPassword));
router.post('/profile/email', asyncHandler(authenticate), requireCsrf, asyncHandler(postEmailChangeRequest));
router.post('/profile/email/confirm', asyncHandler(authenticate), requireCsrf, asyncHandler(postEmailChangeConfirm));
export default router;
