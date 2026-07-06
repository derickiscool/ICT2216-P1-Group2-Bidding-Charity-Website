import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { complete, listMine, processDeadlines } from '../controllers/payment.controller';

const router = Router();

// Bidder-facing payment deadline screen.
router.get('/mine', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(listMine));

// Simulated payment completion. The backend derives amount and bidder from the
// pending payment record; the client only supplies the payment UUID in the URL.
router.post('/:uuid/complete', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(complete));

// Admin/manual trigger for demos and tests. The real app also runs this as a
// background worker from index.ts.
router.post('/process-deadlines/run', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(processDeadlines));

export default router;