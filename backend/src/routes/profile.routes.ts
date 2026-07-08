import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { patchProfile, postPasswordVerification, putPassword } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { createOtpRequestLimiter } from '../middleware/otpRequestLimit.middleware';

const passwordVerificationLimiter = createOtpRequestLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  keyOf: (req) => String(req.user!.id),
});

const router = Router();
router.put('/profile', asyncHandler(authenticate), requireCsrf, asyncHandler(patchProfile));
router.post(
  '/profile/password/verification',
  asyncHandler(authenticate),
  passwordVerificationLimiter,
  requireCsrf,
  asyncHandler(postPasswordVerification),
);
router.put('/profile/password', asyncHandler(authenticate), requireCsrf, asyncHandler(putPassword));
export default router;
