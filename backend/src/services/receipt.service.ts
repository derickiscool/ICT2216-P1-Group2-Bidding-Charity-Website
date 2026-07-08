import crypto from 'crypto';
import { addReceipt, getPaymentByUuid, getReceiptByPaymentId, getReceiptByUuid, getReceiptsByBidder } from '../repositories';
import type { Payment, Listing } from '../types/domain';
import type { Receipt } from '../types/domain';

const buildReceiptRef = (paymentId: number): string => `RCP-${paymentId}-${crypto.randomUUID().slice(0, 8)}`;

export const generateReceipt = async (payment: Payment, listing: Listing, bidderUsername: string): Promise<Receipt> => {
  const receiptRef = buildReceiptRef(payment.id);

  // Build receipt data for integrity hash
  const receiptData = {
    payment_id: payment.id,
    listing_id: listing.id,
    bidder_id: payment.bidder_id,
    item_title: listing.title,
    amount: payment.amount,
    charity_name: listing.charityName,
    receipt_ref: receiptRef,
    generated_at: new Date().toISOString(),
    bidder_username: bidderUsername,
    payment_ref: payment.payment_ref,
  };

  // SHA-256 integrity hash per NFSR03
  const integrityHash = crypto.createHash('sha256').update(JSON.stringify(receiptData)).digest('hex');

  return addReceipt({
    ...receiptData,
    integrity_hash: integrityHash,
  });
};

export const getReceipt = async (uuid: string): Promise<Receipt | undefined> => getReceiptByUuid(uuid);

export const getReceiptByPaymentUuid = async (paymentUuid: string): Promise<Receipt | undefined> => {
  const payment = await getPaymentByUuid(paymentUuid);
  if (!payment) return undefined;
  return getReceiptByPaymentId(payment.id);
};

export const listMyReceipts = async (bidderId: number): Promise<Receipt[]> => getReceiptsByBidder(bidderId);
