import type { Request, Response } from 'express';
import { getBidderBids, listBidsForListing, placeBid } from '../services/bid.service';

export const createBid = async (req: Request, res: Response): Promise<void> => {
  const bid = await placeBid(Number(req.body.listing_id ?? req.body.listingId), Number(req.body.amount), req);
  req.app.get('io')?.to(`listing:${bid.listing_id}`).emit('bid:placed', bid);
  res.status(201).json(bid);
};

export const listListingBids = async (req: Request, res: Response): Promise<void> => {
  res.json(await listBidsForListing(Number(req.params.listingId)));
};

export const bidderBids = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  res.json(await getBidderBids(req.user.id));
};
