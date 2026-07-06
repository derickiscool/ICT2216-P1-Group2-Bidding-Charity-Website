import type { Request, Response } from 'express';
import {
  approveListing,
  createListing,
  deleteListing,
  getPendingListings,
  getMyListingTrackingDashboard,
  getPublicListing,
  listMyListings,
  searchPublicListings,
  updateListingDetails,
} from '../services/listing.service';

export const listActive = async (req: Request, res: Response): Promise<void> => {
  const listings = await searchPublicListings(req.query);
  res.json({ data: listings, total: listings.length });
};

export const listMine = async (req: Request, res: Response): Promise<void> => {
  const listings = await listMyListings(req);
  res.json({ data: listings, total: listings.length });
};

export const listMineTracking = async (req: Request, res: Response): Promise<void> => {
  res.json(await getMyListingTrackingDashboard(req));
};

export const getListing = async (req: Request, res: Response): Promise<void> => {
  res.json(await getPublicListing(req.params.uuid));
};

export const create = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createListing(req.body, req));
};

export const update = async (req: Request, res: Response): Promise<void> => {
  res.json(await updateListingDetails(req.params.uuid, req.body, req));
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  res.json(await deleteListing(req.params.uuid, req));
};

export const pending = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getPendingListings());
};

export const approve = async (req: Request, res: Response): Promise<void> => {
  res.json(await approveListing(req.params.uuid, req));
};