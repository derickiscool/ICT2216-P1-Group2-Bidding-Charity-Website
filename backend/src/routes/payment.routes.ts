import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { complete, getReceipt, getReceiptByPayment, listMine, processDeadlines } from '../controllers/payment.controller';

const router = Router();

// Bidder-facing payment deadline screen.
router.get('/mine', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(listMine));

// SFR14: retrieve the immutable receipt by receipt UUID
router.get('/receipts/:uuid', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(getReceipt));
// SFR14: retrieve the receipt directly by payment UUID (used by the payments page)
router.get('/:uuid/receipt', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(getReceiptByPayment));

// Simulated payment completion. The backend derives amount and bidder from the
// pending payment record; the client only supplies the payment UUID in the URL.
router.post('/:uuid/complete', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(complete));

// Admin/manual trigger for demos and tests. The real app also runs this as a
// background worker from index.ts.
router.post('/process-deadlines/run', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(processDeadlines));

export default router;