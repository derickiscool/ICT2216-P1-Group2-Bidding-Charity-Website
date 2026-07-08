import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { login, logout, me, register, verifyRegistration, forgotPassword, resetPassword, requestLoginOtp, verifyLoginOtp, forceChangePassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { createOtpRequestLimiter } from '../middleware/otpRequestLimit.middleware';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const otpRequestLimiter = createOtpRequestLimiter({ windowMs: TEN_MINUTES_MS, limit: 3 });
const loginLimiter = createOtpRequestLimiter({ windowMs: TEN_MINUTES_MS, limit: 10 });

const router = Router();
router.post('/register', otpRequestLimiter, asyncHandler(register));
router.post('/register/verify', asyncHandler(verifyRegistration));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/login/passwordless/request', otpRequestLimiter, asyncHandler(requestLoginOtp));
router.post('/login/passwordless/verify', asyncHandler(verifyLoginOtp));
router.get('/me', asyncHandler(authenticate), asyncHandler(me));
router.post('/logout', asyncHandler(authenticate), requireCsrf, asyncHandler(logout));
router.post('/forgot-password', otpRequestLimiter, asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));
router.post('/force-change-password', asyncHandler(authenticate), requireCsrf, asyncHandler(forceChangePassword));
export default router;
