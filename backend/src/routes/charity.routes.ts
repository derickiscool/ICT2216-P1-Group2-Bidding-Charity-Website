import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { badRequest } from '../utils/errors';
import { charityDashboard, createCharityRegistration, listPublicCampaigns, listCharityRegistrations, reviewCharityRegistration } from '../controllers/charity.controller';
import { createCharityStaff, deactivateCharityStaff, getCharityStaff, updateCharityStaff } from '../controllers/charityStaff.controller';
import { getCampaignImage, getCampaigns, patchCloseCampaign, postCampaign, putCampaign } from '../controllers/campaign.controller';

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

const handleDocUpload = (req: Request, res: Response, next: NextFunction): void => {
  docUpload.single('supportingDocument')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest('Supporting document upload failed.', 'UPLOAD_REJECTED', { reason: err.code }));
    if (err) return next(err);
    next();
  });
};

const handleImgUpload = (req: Request, res: Response, next: NextFunction): void => {
  imgUpload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(badRequest('Image upload failed.', 'UPLOAD_REJECTED', { reason: err.code }));
    if (err) return next(err);
    next();
  });
};

const router = Router();
router.get('/dashboard', asyncHandler(authenticate), requireRole('charity', 'admin'), asyncHandler(charityDashboard));
router.post('/register', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'admin'), handleDocUpload, asyncHandler(createCharityRegistration));
// Public: all active campaigns — used by donors on the listing creation form.
router.get('/campaigns/public', asyncHandler(listPublicCampaigns));
router.get('/', asyncHandler(authenticate), requireRole('admin'), asyncHandler(listCharityRegistrations));
router.post('/:uuid/review', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(reviewCharityRegistration));

router.get('/staff', asyncHandler(authenticate), requireRole('charity', 'admin'), asyncHandler(getCharityStaff));
router.post('/staff', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'admin'), asyncHandler(createCharityStaff));
router.put('/staff/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'admin'), asyncHandler(updateCharityStaff));
router.patch('/staff/:uuid/deactivate', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'admin'), asyncHandler(deactivateCharityStaff));

router.get('/campaigns', asyncHandler(authenticate), requireRole('charity', 'charity_staff', 'admin'), asyncHandler(getCampaigns));
router.post('/campaigns', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'charity_staff', 'admin'), handleImgUpload, asyncHandler(postCampaign));
router.put('/campaigns/:uuid', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'charity_staff', 'admin'), handleImgUpload, asyncHandler(putCampaign));
router.patch('/campaigns/:uuid/close', asyncHandler(authenticate), requireCsrf, requireRole('charity', 'charity_staff', 'admin'), asyncHandler(patchCloseCampaign));
router.get('/campaigns/:uuid/image', asyncHandler(getCampaignImage));

export default router;
