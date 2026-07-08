import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { patchProfile, postEmailChangeCurrentVerification, postEmailChangeRequest, postPasswordVerification, putEmail, putPassword } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';

const router: Router = Router();
router.put('/profile', asyncHandler(authenticate), requireCsrf, asyncHandler(patchProfile));
router.post('/profile/email/request', asyncHandler(authenticate), requireCsrf, asyncHandler(postEmailChangeRequest));
router.post('/profile/email/verify-current', asyncHandler(authenticate), requireCsrf, asyncHandler(postEmailChangeCurrentVerification));
router.put('/profile/email', asyncHandler(authenticate), requireCsrf, asyncHandler(putEmail));
router.post('/profile/password/verification', asyncHandler(authenticate), requireCsrf, asyncHandler(postPasswordVerification));
router.put('/profile/password', asyncHandler(authenticate), requireCsrf, asyncHandler(putPassword));
export default router;
