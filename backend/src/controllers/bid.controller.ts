import type { Request, Response } from 'express';
import {
  cancelAutoBid,
  getBidderAutoBids,
  getBidderBids,
  getMyAutoBidForListing,
  listBidsForListing,
  placeBid,
  setAutoBid,
} from '../services/bid.service';

const emitBidUpdates = (req: Request, bids: Array<{ listing_id: number }>): void => {
  const io = req.app.get('io');
  for (const bid of bids) {
    io?.to(`listing:${bid.listing_id}`).emit('bid:placed', bid);
  }
};

export const createBid = async (req: Request, res: Response): Promise<void> => {
  const result = await placeBid(Number(req.body.listing_id ?? req.body.listingId), Number(req.body.amount), req);
  emitBidUpdates(req, result.bids);
  res.status(201).json(result);
};

export const createAutoBid = async (req: Request, res: Response): Promise<void> => {
  const payload = await setAutoBid(Number(req.body.listing_id ?? req.body.listingId), Number(req.body.max_amount ?? req.body.maxAmount), req);
  emitBidUpdates(req, payload.result.bids);
  res.status(201).json(payload);
};

export const deleteAutoBid = async (req: Request, res: Response): Promise<void> => {
  const autoBid = await cancelAutoBid(Number(req.params.listingId), req);
  res.json(autoBid);
};

export const myAutoBidForListing = async (req: Request, res: Response): Promise<void> => {
  res.json(await getMyAutoBidForListing(Number(req.params.listingId), req) ?? null);
};

export const bidderAutoBids = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  res.json(await getBidderAutoBids(req.user.id));
};

export const listListingBids = async (req: Request, res: Response): Promise<void> => {
  res.json(await listBidsForListing(Number(req.params.listingId)));
};

export const bidderBids = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  res.json(await getBidderBids(req.user.id));
};