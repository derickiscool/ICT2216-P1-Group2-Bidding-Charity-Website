import type { Request } from 'express';
import type { Listing, ShippingVerification } from '../types/domain';
import {
  createShippingVerification,
  getListingByUuid,
  getPaymentsForListing,
  updateListing,
  updatePayment,
} from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { sanitizeText } from '../utils/security';
import { audit } from './audit.service';

export const confirmShipping = async (
  listingUuid: string,
  body: Record<string, unknown>,
  req: Request,
): Promise<ShippingVerification> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('donor')) throw forbidden('Only donors can confirm shipping.');

  const listing = await getListingByUuid(listingUuid);
  if (!listing) throw notFound('Listing not found.');
  if (listing.status !== 'sold') {
    throw badRequest('Shipping can only be confirmed for sold listings.', 'INVALID_LISTING_STATUS');
  }
  if (listing.donor_id !== req.user.id) throw forbidden('You can only confirm shipping for your own listings.');

  const trackingNumber = sanitizeText(body.trackingNumber ?? body.tracking_number, 200);
  const carrier = sanitizeText(body.carrier, 100);
  const notes = sanitizeText(body.notes ?? '', 500);

  if (!trackingNumber) throw badRequest('Tracking number is required.', 'VALIDATION_ERROR', { trackingNumber: 'Tracking number is required.' });
  if (!/^[A-Z]{2,4}-[A-Z0-9]{6,20}$/.test(trackingNumber)) {
    throw badRequest('Tracking number must be in the format XX-XXXXXXXX (e.g. SG-123456789).', 'VALIDATION_ERROR', { trackingNumber: 'Invalid tracking number format.' });
  }
  if (!carrier) throw badRequest('Carrier is required.', 'VALIDATION_ERROR', { carrier: 'Carrier is required.' });

  const shipVerification = await createShippingVerification({
    listingId: listing.id,
    donorId: req.user.id,
    trackingNumber,
    carrier,
    notes,
  });

  listing.status = 'shipped';
  await updateListing(listing);

  await audit(req, 'SHIPPING_CONFIRMED', { listingId: listing.id, trackingNumber, carrier }, 'listing', listing.uuid, req.user.id);

  return shipVerification;
};

export const confirmDelivery = async (listingUuid: string, req: Request): Promise<Listing> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidders can confirm delivery.');

  const listing = await getListingByUuid(listingUuid);
  if (!listing) throw notFound('Listing not found.');

  // SFR15: reject any attempt to force the listing into 'delivered' without going through 'shipped'
  if (listing.status !== 'shipped') {
    throw badRequest('Delivery can only be confirmed for shipped listings.', 'INVALID_LISTING_STATUS');
  }
  if (listing.winner_id !== req.user.id) throw forbidden('Only the winning bidder can confirm delivery.');

  listing.status = 'delivered';
  await updateListing(listing);

  const payments = await getPaymentsForListing(listing.id);
  const successfulPayment = payments.find(p => p.status === 'successful');
  if (successfulPayment) {
    successfulPayment.escrow_state = 'released';
    await updatePayment(successfulPayment);
  }

  await audit(req, 'DELIVERY_CONFIRMED', { listingId: listing.id }, 'listing', listing.uuid, req.user.id);

  return listing;
};
