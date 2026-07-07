import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { startServer, stopServer, request, postJson, loginAs } from '../helpers/setup';
import { query } from '../../utils/db';

beforeAll(startServer);
afterAll(stopServer);

type Rec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Shared setup helper: drives the full auction lifecycle up to a confirmed
// payment and returns handles for the donor, bidder, listing, and payment.
// ---------------------------------------------------------------------------
const setupPaidAuction = async () => {
  const donor  = await loginAs('donor@bidforgood.test');
  const bidder = await loginAs('bidder@bidforgood.test');
  const admin  = await loginAs('admin@bidforgood.test');

  // Donor creates a listing (test mode accepts charityName directly)
  const listingRes = await postJson(
    '/api/listings',
    {
      title: 'Rare Vintage Watch',
      description: 'A rare vintage watch donated for charity.',
      category: 'Collectibles',
      charityName: 'Test Charity',
      starting_price: 500,
      min_increment: 50,
      durationHours: 24,
    },
    { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
  );
  assert.equal(listingRes.response.status, 201);
  const listing = listingRes.body as Rec;

  // Admin approves so it becomes active
  const approveRes = await postJson(
    `/api/listings/${listing.uuid as string}/approve`,
    {},
    { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
  );
  assert.equal(approveRes.response.status, 200);

  // Bidder places a bid
  const bidRes = await postJson(
    '/api/bids',
    { listing_id: listing.id, amount: Number(listing.current_bid) + Number(listing.min_increment) },
    { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
  );
  assert.equal(bidRes.response.status, 201);

  // Backdate both times to close the auction (end_time > start_time constraint must hold)
  await query(
    `UPDATE listings SET start_time = NOW() - INTERVAL '2 seconds', end_time = NOW() - INTERVAL '1 second' WHERE id = $1`,
    [listing.id],
  );

  // Admin runs process-deadlines to close the auction and create a payment offer
  const deadlineRes = await postJson(
    '/api/payments/process-deadlines/run',
    {},
    { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
  );
  assert.equal(deadlineRes.response.status, 200);

  // Bidder fetches their pending payment
  const paymentsRes = await request('/api/payments/mine', { headers: { cookie: bidder.cookie } });
  assert.equal(paymentsRes.response.status, 200);
  const payments = (paymentsRes.body as Rec).data as Rec[];
  const pendingPayment = payments.find(p => p.status === 'pending');
  assert.ok(pendingPayment, 'bidder should have a pending payment offer after auction closes');

  // Bidder completes payment — this generates the receipt
  const payRes = await postJson(
    `/api/payments/${pendingPayment.uuid as string}/complete`,
    {},
    { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
  );
  assert.equal(payRes.response.status, 200);

  return { listing, donor, bidder, admin, paymentUuid: pendingPayment.uuid as string };
};

// ─────────────────────────────────────────────────────────────────────────────
// SFR14 — Digital Donation Receipt
// Note: Receipt is generated on escrow release (delivery confirmation), not
// on payment completion. Tests below go through the full payment+ship+confirm flow.
// ─────────────────────────────────────────────────────────────────────────────
const setupFullFlowReceipt = async () => {
  const ctx = await setupPaidAuction();
  // Donor ships
  await postJson(
    `/api/listings/${ctx.listing.uuid as string}/shipping`,
    { tracking_number: 'RCP-TEST-001', courier: 'DHL' },
    { cookie: ctx.donor.cookie, 'x-csrf-token': ctx.donor.csrf },
  );
  // Bidder confirms delivery — generates receipt
  await postJson(
    `/api/listings/${ctx.listing.uuid as string}/confirm-delivery`,
    {},
    { cookie: ctx.bidder.cookie, 'x-csrf-token': ctx.bidder.csrf },
  );
  return ctx;
};

describe('SFR14 — Digital Donation Receipt', () => {
  test('receipt is generated after delivery confirmation', async () => {
    const { listing, bidder } = await setupFullFlowReceipt();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    assert.equal(rows.rows.length, 1, 'a receipt row should exist after delivery confirmation');

    const receiptUuid = rows.rows[0].uuid as string;
    const res = await request(`/api/receipts/${receiptUuid}`, { headers: { cookie: bidder.cookie } });
    assert.equal(res.response.status, 200);
  });

  test('receipt captures the correct amount, item title, and charity', async () => {
    const { listing, bidder } = await setupFullFlowReceipt();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    const res = await request(`/api/receipts/${receiptUuid}`, { headers: { cookie: bidder.cookie } });
    assert.equal(res.response.status, 200);

    const receipt = res.body as Rec;
    assert.equal(receipt.item_title, listing.title, 'receipt item title must match listing title');
    assert.equal(receipt.charity_name, 'Test Charity', 'receipt charity must match listing charity name');
    assert.ok(typeof receipt.amount === 'number' && receipt.amount > 0, 'receipt amount must be a positive number');
    assert.ok(typeof receipt.generated_at === 'string', 'receipt must have a generated_at timestamp');
  });

  test('receipt is accessible to admin — 200 (admin override)', async () => {
    const { listing } = await setupFullFlowReceipt();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    const admin = await loginAs('admin@bidforgood.test');
    const res = await request(`/api/receipts/${receiptUuid}`, { headers: { cookie: admin.cookie } });
    assert.equal(res.response.status, 200);
  });

  test('no PUT or PATCH route exists for receipts — 404', async () => {
    const { listing, bidder } = await setupFullFlowReceipt();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    const putRes = await request(`/api/receipts/${receiptUuid}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: bidder.cookie },
      body: JSON.stringify({ amount: 999999 }),
    });
    assert.equal(putRes.response.status, 404, 'PUT on receipt must not exist');

    const patchRes = await request(`/api/receipts/${receiptUuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bidder.cookie },
      body: JSON.stringify({ charity_name: 'HACKED' }),
    });
    assert.equal(patchRes.response.status, 404, 'PATCH on receipt must not exist');
  });

  test('completing the same payment a second time is rejected — immutability guard', async () => {
    const { paymentUuid, bidder } = await setupPaidAuction();
    const res = await postJson(
      `/api/payments/${paymentUuid}/complete`,
      {},
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'PAYMENT_NOT_PENDING');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SFR15 — Shipping Verification & Delivery Confirmation
// ─────────────────────────────────────────────────────────────────────────────
describe('FR17 — Shipping & Delivery', () => {
  test('donor cannot ship when listing has no held payment', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const listingsRes = await request('/api/listings');
    const listings = (listingsRes.body as Rec).data as Rec[];
    const activeListing = listings.find(l => l.status === 'active');
    assert.ok(activeListing);

    const res = await postJson(
      `/api/listings/${activeListing.uuid as string}/shipping`,
      { tracking_number: 'TN123', courier: 'DHL' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'SHIPPING_PAYMENT_NOT_HELD');
  });

  test('non-donor role cannot submit shipping details — 403', async () => {
    const { listing, bidder } = await setupPaidAuction();
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/shipping`,
      { tracking_number: 'TN123', courier: 'DHL' },
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 403);
  });

  test('XSS payloads in shipping fields are sanitized before storage', async () => {
    const { listing, donor } = await setupPaidAuction();
    const xssPayload = '<script>alert(1)</script>';

    const res = await postJson(
      `/api/listings/${listing.uuid as string}/shipping`,
      {
        tracking_number: 'TN-XSSTEST01',
        courier: `DHL${xssPayload}`,
      },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(res.response.status, 200);

    const shipBody = res.body as unknown as { delivery: Rec; listing: Rec };
    assert.ok(!String(shipBody.delivery.courier).includes('<script>'), 'courier must have HTML stripped');
  });

  test('valid shipping creates a delivery record', async () => {
    const { listing, donor } = await setupPaidAuction();

    const shipRes = await postJson(
      `/api/listings/${listing.uuid as string}/shipping`,
      { tracking_number: 'TRK-123456', courier: 'FedEx' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(shipRes.response.status, 200);

    const body = shipRes.body as unknown as { delivery: Rec; listing: Rec };
    assert.equal(body.delivery.tracking_number, 'TRK-123456');
    assert.equal(body.delivery.courier, 'FedEx');
    assert.ok(body.delivery.shipped_at, 'shipment should have a shipped_at timestamp');
  });

  test('bidder cannot confirm delivery when shipping not arranged — 400', async () => {
    const { listing, bidder } = await setupPaidAuction();
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/confirm-delivery`,
      {},
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'SHIPPING_NOT_ARRANGED');
  });

  test('non-winner role cannot confirm delivery — 403', async () => {
    const { listing, donor } = await setupPaidAuction();

    // Donor ships first
    await postJson(
      `/api/listings/${listing.uuid as string}/shipping`,
      { tracking_number: 'TN-DLV00001', courier: 'UPS' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );

    // Donor is not the winner bidder — should be rejected
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/confirm-delivery`,
      {},
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    // Donor doesn't have bidder role → RBAC returns 403
    assert.equal(res.response.status, 403);
  });

  test('winning bidder confirming delivery releases escrow', async () => {
    const { listing, donor, bidder } = await setupPaidAuction();

    await postJson(
      `/api/listings/${listing.uuid as string}/shipping`,
      { tracking_number: 'TN-FLOW0001', courier: 'SingPost' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );

    const confirmRes = await postJson(
      `/api/listings/${listing.uuid as string}/confirm-delivery`,
      {},
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(confirmRes.response.status, 200);
    const body = confirmRes.body as unknown as { delivery: Rec };
    assert.ok(body.delivery.confirmed_at, 'delivery should have a confirmed_at timestamp');

    // Escrow should be released
    const paymentsRow = await query(
      `SELECT escrow_state FROM payments WHERE listing_id = $1 AND status = 'successful' LIMIT 1`,
      [listing.id],
    );
    assert.equal(paymentsRow.rows[0]?.escrow_state, 'released');
  });
});
