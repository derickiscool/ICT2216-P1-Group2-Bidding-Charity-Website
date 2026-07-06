import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { login, logout, me, register, verifyRegistration, requestLoginOtp, verifyLoginOtp } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';

const router = Router();
router.post('/register', asyncHandler(register));
router.post('/register/verify', asyncHandler(verifyRegistration));
router.post('/login', asyncHandler(login));
router.post('/login/passwordless/request', asyncHandler(requestLoginOtp));
router.post('/login/passwordless/verify', asyncHandler(verifyLoginOtp));
router.get('/me', asyncHandler(authenticate), asyncHandler(me));
router.post('/logout', asyncHandler(authenticate), requireCsrf, asyncHandler(logout));
export default router;
