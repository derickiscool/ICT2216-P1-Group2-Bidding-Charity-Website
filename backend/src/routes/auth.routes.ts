import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler';
import { login, logout, me, register, verifyRegistration, forgotPassword, resetPassword, requestLoginOtp, verifyLoginOtp, forceChangePassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { rateLimitHandler } from '../middleware/rateLimit.middleware';

const router: Router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', handler: rateLimitHandler('RATE_LIMIT_AUTH') });
const resetLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test', handler: rateLimitHandler('RATE_LIMIT_PASSWORD_RESET') });

router.post('/register', authLimiter, asyncHandler(register));
router.post('/register/verify', authLimiter, asyncHandler(verifyRegistration));
router.post('/login', authLimiter, asyncHandler(login));
router.post('/login/passwordless/request', authLimiter, asyncHandler(requestLoginOtp));
router.post('/login/passwordless/verify', authLimiter, asyncHandler(verifyLoginOtp));
router.get('/me', asyncHandler(authenticate), asyncHandler(me));
router.post('/logout', asyncHandler(authenticate), requireCsrf, asyncHandler(logout));
router.post('/forgot-password', resetLimiter, asyncHandler(forgotPassword));
router.post('/reset-password', resetLimiter, asyncHandler(resetPassword));
router.post('/force-change-password', asyncHandler(authenticate), requireCsrf, asyncHandler(forceChangePassword));
export default router;
