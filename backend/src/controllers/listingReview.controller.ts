import type { Request, Response } from 'express';
import { listListingsForCharityReview, reviewAssignedListing } from '../services/listingReview.service';

export const listCharityReviewListings = async (req: Request, res: Response): Promise<void> => {
  res.json(await listListingsForCharityReview(req));
};

export const reviewCharityListing = async (req: Request, res: Response): Promise<void> => {
  res.json(await reviewAssignedListing(req.params.uuid, req.body.decision, req.body.reason, req));
};