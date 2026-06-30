import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { patchProfile } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';

const router = Router();
router.put('/profile', asyncHandler(authenticate), requireCsrf, asyncHandler(patchProfile));
export default router;
