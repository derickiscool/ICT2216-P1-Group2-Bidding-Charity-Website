import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  loginAs,
} from '../helpers/setup';

type Body = Record<string, unknown>;

beforeAll(startServer);
afterAll(stopServer);

// ─────────────────────────────────────────────────────────────────────────────
// FR18 — Donor Dashboard
// Donor can view and track all their auction listings by status, view final
// auction results for sold items, and view donation proceeds per listing.
// ─────────────────────────────────────────────────────────────────────────────
describe('FR18 — Donor Dashboard', () => {
  test('rejects unauthenticated requests with 401', async () => {
    const res = await request('/api/listings/donor');
    assert.equal(res.response.status, 401);
  });

  test('rejects non-donor roles — bidder receives 403', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/listings/donor', { headers: { cookie } });
    assert.equal(res.response.status, 403);
  });

  test('returns listings array and stats object for the authenticated donor', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/listings/donor', { headers: { cookie } });
    assert.equal(res.response.status, 200);

    const body = res.body as Body;
    assert.ok(Array.isArray(body.listings), 'body.listings should be an array');
    assert.ok((body.listings as unknown[]).length >= 3, 'donor should see at least 3 seeded listings');
    assert.ok(body.stats && typeof body.stats === 'object', 'body.stats should be an object');
    assert.ok('total' in (body.stats as Body), 'stats should include total');
    assert.ok('totalRaised' in (body.stats as Body), 'stats should include totalRaised');
  });

  test('stats reflect the correct status breakdown from seeded data', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/listings/donor', { headers: { cookie } });
    assert.equal(res.response.status, 200);

    const stats = res.body.stats as Record<string, number>;
    assert.equal(stats.active, 2, 'two seeded active listings');
    assert.equal(stats.pending, 1, 'one seeded pending listing');
    assert.equal(stats.sold, 0);
    assert.equal(stats.draft, 0);
  });

  test('each listing entry contains uuid, title, status, and current_bid', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/listings/donor', { headers: { cookie } });
    assert.equal(res.response.status, 200);

    const listings = (res.body as Body).listings as Record<string, unknown>[];
    for (const listing of listings) {
      assert.ok(listing.uuid, 'listing must have uuid');
      assert.ok(listing.title, 'listing must have title');
      assert.ok(listing.status, 'listing must have status');
      assert.ok(typeof listing.current_bid === 'number', 'listing must have numeric current_bid');
    }
  });

  test('tracking dashboard shows summary counts and per-listing action flags', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/listings/mine/tracking', { headers: { cookie } });
    assert.equal(res.response.status, 200);

    const summary = res.body.summary as Record<string, number>;
    const listings = res.body.listings as Record<string, unknown>[];
    assert.ok(summary && typeof summary === 'object', 'response should include summary');
    assert.ok(summary.total >= 3, 'summary.total should account for all seeded listings');
    assert.ok(typeof summary.active === 'number', 'summary.active should be a number');
    assert.ok(typeof summary.pending === 'number', 'summary.pending should be a number');
    assert.ok(typeof summary.upcoming === 'number', 'summary.upcoming should be a number');
    assert.equal(summary.draft, 0, 'draft listings are hidden from FR10 tracking');

    assert.ok(Array.isArray(listings));
    assert.equal(listings.some(listing => listing.status === 'draft'), false, 'draft listings should not appear in tracking');
    const first = listings[0];
    assert.ok('canEdit' in first, 'each listing should expose canEdit');
    assert.ok('canDelete' in first, 'each listing should expose canDelete');
    assert.ok('statusLabel' in first, 'each listing should expose statusLabel');
    assert.ok('trackingFilterStatus' in first, 'each listing should expose trackingFilterStatus');
    const finAmt = (first as Record<string, unknown>).finalBidAmount;
    assert.ok(finAmt === undefined || typeof finAmt === 'number', 'finalBidAmount should be a number when present');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR19 — Bidder Dashboard
// Bidder can view active bids and current bid status, manage auto-bid settings,
// view past auctions, and access payment history and donation receipts.
// ─────────────────────────────────────────────────────────────────────────────
describe('FR19 — Bidder Dashboard', () => {
  test('rejects unauthenticated requests with 401', async () => {
    const res = await request('/api/bids/bidder');
    assert.equal(res.response.status, 401);
  });

  test('rejects non-bidder roles — donor receives 403', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/bids/bidder', { headers: { cookie } });
    assert.equal(res.response.status, 403);
  });

  test('returns empty bid list and zero stats before any bids are placed', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/bids/bidder', { headers: { cookie } });
    assert.equal(res.response.status, 200);

    const bids = res.body.bids as unknown[];
    const stats = res.body.stats as Record<string, number>;
    assert.ok(Array.isArray(bids));
    assert.equal(bids.length, 0);
    assert.equal(stats.total, 0);
    assert.equal(stats.totalSpent, 0);
    assert.equal(stats.uniqueListings, 0);
  });

  test('bid history and stats update after placing a bid', async () => {
    const listingsRes = await request('/api/listings');
    assert.equal(listingsRes.response.status, 200);
    const listings = listingsRes.body.data as { id: number; current_bid: number; min_increment: number }[];
    const target = listings.find(l => l.current_bid > 0 && l.min_increment > 0);
    assert.ok(target, 'need at least one active listing with a current bid');

    const { cookie, csrf } = await loginAs('bidder@bidforgood.test');
    const amount = target.current_bid + target.min_increment;
    const bidRes = await postJson('/api/bids', { listingId: target.id, amount }, { cookie, 'x-csrf-token': csrf });
    assert.equal(bidRes.response.status, 201);

    const dashRes = await request('/api/bids/bidder', { headers: { cookie } });
    assert.equal(dashRes.response.status, 200);

    const bids = dashRes.body.bids as Record<string, unknown>[];
    const stats = dashRes.body.stats as Record<string, number>;
    assert.equal(stats.total, 1, 'stats.total should reflect the placed bid');
    assert.equal(stats.uniqueListings, 1);
    assert.equal(bids.length, 1);
    assert.ok(bids[0].listingUuid, 'each bid entry should include listing uuid');
  });

  test('auto-bid settings: create, list, and delete', async () => {
    const listingsRes = await request('/api/listings');
    const listings = listingsRes.body.data as { id: number; current_bid: number; min_increment: number }[];
    const target = listings.find(l => l.current_bid > 0 && l.min_increment > 0);
    assert.ok(target, 'need at least one active listing');

    const { cookie, csrf } = await loginAs('bidder@bidforgood.test');
    const maxAmount = target.current_bid + target.min_increment * 5;

    const createRes = await postJson(
      '/api/bids/auto-bids',
      { listingId: target.id, maxAmount },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(createRes.response.status, 201);

    const listRes = await request('/api/bids/auto-bids', { headers: { cookie } });
    assert.equal(listRes.response.status, 200);
    const autoBids = (listRes.body as unknown) as unknown[];
    assert.ok(Array.isArray(autoBids));
    assert.ok(autoBids.length >= 1, 'newly created auto-bid should appear in list');

    const deleteRes = await request(`/api/bids/auto-bids/${target.id}`, {
      method: 'DELETE',
      headers: { cookie, 'x-csrf-token': csrf },
    });
    assert.equal(deleteRes.response.status, 200);

    const afterRes = await request('/api/bids/auto-bids', { headers: { cookie } });
    assert.equal(afterRes.response.status, 200);
    const remaining = (afterRes.body as unknown) as { is_active: boolean; listing_id: number }[];
    assert.ok(Array.isArray(remaining));
    const stillActive = remaining.filter(b => b.is_active && b.listing_id === target.id);
    assert.equal(stillActive.length, 0, 'auto-bid for cancelled listing should no longer be active');
  });

  test('payment history is accessible to bidders and returns a data array', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/payments/mine', { headers: { cookie } });
    assert.equal(res.response.status, 200);
    assert.ok('data' in res.body, "response should have a 'data' field");
    assert.ok(Array.isArray(res.body.data), 'data should be an array');
  });

  test('payment history is not accessible to donors — receives 403', async () => {
    const { cookie } = await loginAs('donor@bidforgood.test');
    const res = await request('/api/payments/mine', { headers: { cookie } });
    assert.equal(res.response.status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR20 — Charity Dashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('FR20 — Charity Dashboard', () => {
  test('returns charity dashboard with listings and stats', async () => {
    const { cookie } = await loginAs('charity@bidforgood.test');
    const res = await request('/api/charities/dashboard', { headers: { cookie } });
    assert.equal(res.response.status, 200);
    const body = res.body as Body;
    assert.ok(body.charity);
    assert.ok(Array.isArray(body.listings));
    assert.ok(body.stats);
  });

  test('includes admin-forwarded listings that are awaiting charity review', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');
    const charity = await loginAs('charity@bidforgood.test');

    const created = await postJson(
      '/api/listings',
      {
        title: 'Dashboard Charity Review Item',
        description: 'This listing should appear in the charity dashboard review queue.',
        category: 'Collectibles',
        charityName: 'Test Charity',
        starting_price: 100,
        min_increment: 10,
        durationHours: 24,
      },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(created.response.status, 201);

    const forwarded = await postJson(
      `/api/listings/${created.body.uuid}/approve`,
      {},
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(forwarded.response.status, 200);
    assert.equal(forwarded.body.status, 'charity_review');

    const dashboard = await request('/api/charities/dashboard', { headers: { cookie: charity.cookie } });
    assert.equal(dashboard.response.status, 200);
    const dashboardBody = dashboard.body as Body;
    const listings = dashboardBody.listings as Array<{ uuid: string; status: string }>;
    const reviewItem = listings.find(listing => listing.uuid === created.body.uuid);
    assert.equal(reviewItem?.status, 'charity_review');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FR21 — Admin Dashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('FR21 — Admin Dashboard', () => {
  test('returns admin stats', async () => {
    const { cookie } = await loginAs('admin@bidforgood.test');
    const res = await request('/api/admin/stats', { headers: { cookie } });
    assert.equal(res.response.status, 200);
    const body = res.body as Body;
    assert.equal(typeof body.totalUsers, 'number');
    assert.equal(typeof body.totalListings, 'number');
    assert.equal(typeof body.totalBids, 'number');
  });

  test('rejects non-admin access', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/admin/stats', { headers: { cookie } });
    assert.equal(res.response.status, 403);
  });
});