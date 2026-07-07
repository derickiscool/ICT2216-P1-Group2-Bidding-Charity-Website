import type { Request, Response } from 'express';
import { completePayment, getReceipt as getReceiptService, listMyPayments, processAuctionDeadlines } from '../services/payment.service';

export const listMine = async (req: Request, res: Response): Promise<void> => {
  const payments = await listMyPayments(req);
  res.json({ data: payments, total: payments.length });
};

export const complete = async (req: Request, res: Response): Promise<void> => {
  const payment = await completePayment(req.params.uuid, req);
  res.json(payment);
};

export const processDeadlines = async (req: Request, res: Response): Promise<void> => {
  res.json(await processAuctionDeadlines(req));
};

export const getReceipt = async (req: Request, res: Response): Promise<void> => {
  res.json(await getReceiptService(req.params.uuid, req));
};