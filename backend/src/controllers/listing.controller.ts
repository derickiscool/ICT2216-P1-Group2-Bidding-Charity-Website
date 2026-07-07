import type { Request, Response } from 'express';
import {
  approveListing,
  confirmDelivery,
  createListing,
  deleteListing,
  getDonorListings,
  getPendingListings,
  getPublicListing,
  listMyListings,
  provideTracking,
  rejectListing,
  requestListingChanges,
  searchPublicListings,
  updateListingDetails,
} from '../services/listing.service';
import { getMyListingTrackingDashboard } from '../services/listingTracking.service';
import { closeExpiredAuctions } from '../services/payment.service';

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
  const isAdmin = req.user?.roles?.includes('admin') ?? false;
  res.json(await getPublicListing(req.params.uuid, isAdmin));
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

export const reject = async (req: Request, res: Response): Promise<void> => {
  res.json(await rejectListing(req.params.uuid, req.body.reason, req));
};

export const requestChanges = async (req: Request, res: Response): Promise<void> => {
  res.json(await requestListingChanges(req.params.uuid, req.body.reason, req));
};

export const donorListings = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  res.json(await getDonorListings(req.user.id));
};

export const shipping = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  const result = await provideTracking(req.params.uuid, req.body.tracking_number, req.body.courier, req);
  res.json(result);
};

export const confirmDeliveryHandler = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  const result = await confirmDelivery(req.params.uuid, req);
  res.json(result);
};

export const forceClose = async (req: Request, res: Response): Promise<void> => {
  const count = await closeExpiredAuctions(req.params.uuid);
  res.json({ message: `Closed ${count} listing(s).`, processed: count });
};
