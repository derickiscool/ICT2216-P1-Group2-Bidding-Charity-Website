import type { Request, Response } from 'express';
import { getReceipt, getReceiptByPaymentUuid, listMyReceipts } from '../services/receipt.service';
import { notFound, forbidden } from '../utils/errors';

export const viewReceipt = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  const receipt = await getReceipt(req.params.uuid);
  if (!receipt) throw notFound('Receipt not found');

  // Only the bidder, the listing's charity staff/admin, or site admins can view
  const isAdmin = req.user.roles.includes('admin');
  if (receipt.bidder_id !== req.user.id && !isAdmin) throw notFound('Receipt not found');

  res.json(receipt);
};

export const viewReceiptByPayment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  const receipt = await getReceiptByPaymentUuid(req.params.uuid);
  if (!receipt) throw notFound('Receipt not found');
  const isAdmin = req.user.roles.includes('admin');
  if (receipt.bidder_id !== req.user.id && !isAdmin) throw notFound('Receipt not found');
  res.json(receipt);
};

export const listMine = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidders can view their receipts.');
  const receipts = await listMyReceipts(req.user.id);
  res.json({ data: receipts, total: receipts.length });
};
