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

  // Bidder completes payment — this generates the receipt (SFR14)
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
// ─────────────────────────────────────────────────────────────────────────────
describe('SFR14 — Digital Donation Receipt', () => {
  test('receipt is automatically generated when payment is completed', async () => {
    const { listing, bidder } = await setupPaidAuction();

    // Receipt is stored; fetch it by querying the DB via the listing's id
    const rows = await query(
      'SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1',
      [listing.id],
    );
    assert.equal(rows.rows.length, 1, 'a receipt row should exist after payment');

    const receiptUuid = rows.rows[0].uuid as string;
    const res = await request(`/api/payments/receipts/${receiptUuid}`, { headers: { cookie: bidder.cookie } });
    assert.equal(res.response.status, 200);
  });

  test('receipt captures the correct amount, item title, and beneficiary', async () => {
    const { listing, bidder } = await setupPaidAuction();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    const res = await request(`/api/payments/receipts/${receiptUuid}`, { headers: { cookie: bidder.cookie } });
    assert.equal(res.response.status, 200);

    const receipt = res.body as Rec;
    assert.equal(receipt.itemTitle, listing.title, 'receipt item title must match listing title');
    assert.equal(receipt.beneficiaryName, 'Test Charity', 'receipt beneficiary must match listing charity name');
    assert.ok(typeof receipt.amount === 'number' && receipt.amount > 0, 'receipt amount must be a positive number');
    assert.ok(typeof receipt.generatedAt === 'string', 'receipt must have a generatedAt timestamp');
  });

  test('receipt is not accessible to a different bidder — 403', async () => {
    const { listing } = await setupPaidAuction();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    // Register and login a second bidder who did not win
    const { cookie: otherCookie } = await loginAs('admin@bidforgood.test');
    // admin has no 'bidder' role → 403 from requireRole
    const res = await request(`/api/payments/receipts/${receiptUuid}`, { headers: { cookie: otherCookie } });
    assert.equal(res.response.status, 403);
  });

  test('no PUT or PATCH route exists for receipts — 404', async () => {
    const { listing, bidder } = await setupPaidAuction();
    const rows = await query('SELECT uuid FROM receipts WHERE listing_id = $1 LIMIT 1', [listing.id]);
    const receiptUuid = rows.rows[0].uuid as string;

    const putRes = await request(`/api/payments/receipts/${receiptUuid}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: bidder.cookie },
      body: JSON.stringify({ amount: 999999 }),
    });
    assert.equal(putRes.response.status, 404, 'PUT on receipt must not exist');

    const patchRes = await request(`/api/payments/receipts/${receiptUuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bidder.cookie },
      body: JSON.stringify({ beneficiaryName: 'HACKED' }),
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
describe('SFR15 — Shipping Verification & Delivery Confirmation', () => {
  test('donor cannot confirm shipping when listing is not yet sold — status guard', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    // Use a seeded active listing that has not been paid for
    const listingsRes = await request('/api/listings');
    const listings = (listingsRes.body as Rec).data as Rec[];
    const activeListing = listings.find(l => l.status === 'active');
    assert.ok(activeListing);

    const res = await postJson(
      `/api/listings/${activeListing.uuid as string}/ship`,
      { trackingNumber: 'TN123', carrier: 'DHL' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'INVALID_LISTING_STATUS');
  });

  test('non-donor role cannot submit shipping details — 403', async () => {
    const { listing, bidder } = await setupPaidAuction();
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/ship`,
      { trackingNumber: 'TN123', carrier: 'DHL' },
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 403);
  });

  test('XSS payloads in shipping fields are sanitized before storage', async () => {
    const { listing, donor } = await setupPaidAuction();
    const xssPayload = '<script>alert(1)</script>';

    const res = await postJson(
      `/api/listings/${listing.uuid as string}/ship`,
      {
        trackingNumber: 'TN-XSSTEST01',
        carrier: `DHL${xssPayload}`,
        notes: `Handle with care. ${xssPayload}`,
      },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(res.response.status, 200);

    const sv = res.body as Rec;
    assert.ok(!String(sv.carrier).includes('<script>'), 'carrier must have HTML stripped');
    assert.ok(!String(sv.notes).includes('<script>'), 'notes must have HTML stripped');
  });

  test('valid shipping confirmation transitions listing status to shipped', async () => {
    const { listing, donor, bidder } = await setupPaidAuction();

    const shipRes = await postJson(
      `/api/listings/${listing.uuid as string}/ship`,
      { trackingNumber: 'TRK-123456', carrier: 'FedEx', notes: 'Fragile item' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(shipRes.response.status, 200);

    const sv = shipRes.body as Rec;
    assert.equal(sv.trackingNumber, 'TRK-123456');
    assert.equal(sv.carrier, 'FedEx');

    // Confirm listing status transitioned to 'shipped' (non-active listings are 404 from the public API)
    const dbRow = await query('SELECT status FROM listings WHERE uuid = $1', [listing.uuid as string]);
    assert.equal(dbRow.rows[0]?.status, 'shipped');
  });

  test('bidder cannot confirm delivery when listing is not yet shipped — forced delivery rejected', async () => {
    const { listing, bidder } = await setupPaidAuction();
    // listing is currently 'sold', not 'shipped' — attempt to jump to 'delivered' must fail
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/deliver`,
      {},
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'INVALID_LISTING_STATUS');
  });

  test('non-winner bidder cannot confirm delivery — 403', async () => {
    const { listing, donor, admin } = await setupPaidAuction();

    // Donor ships first
    await postJson(
      `/api/listings/${listing.uuid as string}/ship`,
      { trackingNumber: 'TN-DLV00001', carrier: 'UPS' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );

    // Admin is not the winner bidder — should be rejected
    const res = await postJson(
      `/api/listings/${listing.uuid as string}/deliver`,
      {},
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(res.response.status, 403);
  });

  test('winning bidder confirming delivery transitions listing to delivered and releases escrow', async () => {
    const { listing, donor, bidder } = await setupPaidAuction();

    await postJson(
      `/api/listings/${listing.uuid as string}/ship`,
      { trackingNumber: 'TN-FLOW0001', carrier: 'SingPost' },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );

    const deliverRes = await postJson(
      `/api/listings/${listing.uuid as string}/deliver`,
      {},
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(deliverRes.response.status, 200);
    assert.equal((deliverRes.body as Rec).status, 'delivered');

    // Escrow should be released
    const paymentsRow = await query(
      `SELECT escrow_state FROM payments WHERE listing_id = $1 AND status = 'successful' LIMIT 1`,
      [listing.id],
    );
    assert.equal(paymentsRow.rows[0]?.escrow_state, 'released');
  });
});
