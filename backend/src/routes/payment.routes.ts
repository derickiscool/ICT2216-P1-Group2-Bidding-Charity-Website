import type { Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireCsrf } from '../middleware/csrf.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { notFound } from '../utils/errors';
import { complete, listMine, processDeadlines, regenerateReceipt } from '../controllers/payment.controller';
import { getReceiptByPaymentUuid } from '../services/receipt.service';

const router = Router();

// Bidder-facing payment deadline screen.
router.get('/mine', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(listMine));

// Simulated payment completion. The backend derives amount and bidder from the
// pending payment record; the client only supplies the payment UUID in the URL.
router.post('/:uuid/complete', asyncHandler(authenticate), requireCsrf, requireRole('bidder'), asyncHandler(complete));

// Admin: regenerate a receipt for a payment if receipt generation failed initially.
router.post('/:uuid/regenerate-receipt', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(regenerateReceipt));

// Admin/manual trigger for demos and tests. The real app also runs this as a
// background worker from index.ts.
router.post('/process-deadlines/run', asyncHandler(authenticate), requireCsrf, requireRole('admin'), asyncHandler(processDeadlines));

// Look up a receipt by payment UUID (used by bidder dashboard)
router.get('/:uuid/receipt', asyncHandler(authenticate), requireRole('bidder'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return;
  const receipt = await getReceiptByPaymentUuid(req.params.uuid);
  if (!receipt || receipt.bidder_id !== req.user.id) throw notFound('Receipt not found');
  res.json(receipt);
}));

export default router;