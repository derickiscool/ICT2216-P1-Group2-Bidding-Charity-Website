import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { badRequest } from '../utils/errors';
import { createCharityRegistration, listCharityRegistrations, reviewCharityRegistration } from '../controllers/charity.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const handleSupportingDocumentUpload = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('supportingDocument')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(badRequest('Supporting document upload failed.', 'UPLOAD_REJECTED', { reason: err.code }));
    }
    if (err) return next(err);
    next();
  });
};

const router = Router();
router.post(
  '/register',
  asyncHandler(authenticate),
  requireCsrf,
  requireRole('charity', 'admin'),
  handleSupportingDocumentUpload,
  asyncHandler(createCharityRegistration)
);
router.get('/', asyncHandler(authenticate), requireRole('admin'), asyncHandler(listCharityRegistrations));
router.post('/:uuid/review', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(reviewCharityRegistration));
export default router;
