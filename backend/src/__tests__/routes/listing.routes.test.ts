import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  loginAs,
  createActiveListing,
} from '../helpers/setup';
import { query } from '../../utils/db';

beforeAll(startServer);
afterAll(stopServer);

describe('SFR12/SFR13 — Search & Filter Security', () => {
  test('hides pending listings from public search and rejects SQL-like queries', async () => {
    const active = await request('/api/listings');
    assert.equal(active.response.status, 200);
    assert.ok(
      active.body.data.every(
        (listing: { status: string }) => listing.status === 'active',
      ),
    );
    assert.equal(
      active.body.data.some((listing: { title: string }) =>
        listing.title.includes('Pending'),
      ),
      false,
    );

    const unsafe = await request("/api/listings?q=%27%20OR%201%3D1--");
    assert.equal(unsafe.response.status, 400);
    assert.equal(unsafe.body.code, 'UNSAFE_SEARCH_QUERY');
  });
});

describe('SFR08 — Active Listing Field Locking', () => {
  test('rejects modifications to locked fields on active auction listings', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');

    const created = { body: await createActiveListing(donor, {
      title: 'Active Config Test',
      description: 'Listing used to test locked active fields.',
      starting_price: 100,
      min_increment: 10,
    }) };
    assert.equal(created.body.status, 'active');

    const locked = await request(`/api/listings/${created.body.uuid}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: admin.cookie,
        'x-csrf-token': admin.csrf,
      },
      body: JSON.stringify({
        startingPrice: 1,
        endTime: new Date().toISOString(),
      }),
    });
    assert.equal(locked.response.status, 403);
    assert.match(locked.body.message, /locked/i);
  });
});

describe('SFR09 — Two-stage listing moderation (Admin → Charity)', () => {
  // Test-mode donor listings attach to the seeded campaign, which is owned by
  // charity@bidforgood.test — so the full admin→charity pipeline is exercisable here.
  const createDonorListing = async (
    donor: { cookie: string; csrf: string },
    title: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const res = await postJson(
      '/api/listings',
      {
        title,
        description: 'A donated item awaiting the two-stage review pipeline.',
        category: 'Collectibles',
        charityName: 'Test Charity',
        starting_price: 100,
        min_increment: 10,
        durationHours: 24,
        ...overrides,
      },
      { cookie: donor.cookie, 'x-csrf-token': donor.csrf },
    );
    assert.equal(res.response.status, 201);
    assert.equal(res.body.status, 'pending');
    return res.body as { uuid: string; id: number; status: string };
  };

  test('admins cannot author listings — separation of duties (403)', async () => {
    const admin = await loginAs('admin@bidforgood.test');
    const res = await postJson(
      '/api/listings',
      {
        title: 'Admin Should Not Create This',
        description: 'An admin must not be able to author a listing they could also moderate.',
        category: 'Collectibles',
        charityName: 'Test Charity',
        starting_price: 100,
        min_increment: 10,
        durationHours: 24,
      },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(res.response.status, 403);
  });

  test('admin approval forwards to the charity (not published); charity approval publishes', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');
    const charity = await loginAs('charity@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 Pipeline Item');

    // A pending listing must NOT yet be visible to the charity review queue.
    const earlyQueue = await request('/api/listings/charity/review', { headers: { cookie: charity.cookie } });
    assert.equal(earlyQueue.response.status, 200);
    assert.equal((earlyQueue.body.listings as { uuid: string }[]).some(l => l.uuid === listing.uuid), false);

    // Admin approves → forwarded to charity, NOT active.
    const approve = await postJson(`/api/listings/${listing.uuid}/approve`, {}, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
    assert.equal(approve.response.status, 200);
    assert.equal(approve.body.status, 'charity_review');
    assert.equal(approve.body.review_stage, 'charity');

    // Still hidden from public listings.
    const publicList = await request('/api/listings');
    assert.equal((publicList.body.data as { uuid: string }[]).some(l => l.uuid === listing.uuid), false);

    // Now it appears in the charity queue.
    const queue = await request('/api/listings/charity/review', { headers: { cookie: charity.cookie } });
    assert.equal((queue.body.listings as { uuid: string }[]).some(l => l.uuid === listing.uuid), true);

    // Charity approves → active (published).
    const charityApprove = await postJson(
      `/api/listings/${listing.uuid}/charity-review`,
      { decision: 'approved' },
      { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    );
    assert.equal(charityApprove.response.status, 200);
    assert.equal(charityApprove.body.status, 'active');
  });

  test('charity approval keeps future auction windows as upcoming until start time', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');
    const charity = await loginAs('charity@bidforgood.test');
    const bidder = await loginAs('bidder@bidforgood.test');

    const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
    const listing = await createDonorListing(donor, 'SFR09 Future Window Item', {
      start_time: futureStart,
      end_time: futureEnd,
    });

    await postJson(`/api/listings/${listing.uuid}/approve`, {}, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
    const charityApprove = await postJson(
      `/api/listings/${listing.uuid}/charity-review`,
      { decision: 'approved' },
      { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    );
    assert.equal(charityApprove.response.status, 200);
    assert.equal(charityApprove.body.status, 'active');

    // FR10: after both approvals, a future-dated listing is approved but shown as UPCOMING,
    // not publicly listed or biddable until the auction start time arrives.
    assert.ok(Math.abs(new Date(charityApprove.body.start_time as string).getTime() - new Date(futureStart).getTime()) < 1000);
    assert.ok(Math.abs(new Date(charityApprove.body.end_time as string).getTime() - new Date(futureEnd).getTime()) < 1000);

    const publicList = await request('/api/listings');
    assert.equal((publicList.body.data as { uuid: string }[]).some(l => l.uuid === listing.uuid), false);

    const publicDetail = await request(`/api/listings/${listing.uuid}`);
    assert.equal(publicDetail.response.status, 404);

    const tracking = await request('/api/listings/mine/tracking', { headers: { cookie: donor.cookie } });
    assert.equal(tracking.response.status, 200);
    const tracked = (tracking.body.listings as Array<{ uuid: string; statusLabel: string; trackingFilterStatus: string }>).find(l => l.uuid === listing.uuid);
    const trackingSummary = tracking.body.summary as { upcoming: number };
    assert.equal(tracked?.statusLabel, 'Upcoming');
    assert.equal(tracked?.trackingFilterStatus, 'upcoming');
    assert.ok(Number(trackingSummary.upcoming) >= 1);

    const bid = await postJson(
      '/api/bids',
      { listing_id: listing.id, amount: 110 },
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(bid.response.status, 400);
    assert.equal(bid.body.code, 'AUCTION_NOT_STARTED');
  });

  test('FR10 hides legacy draft records from donor tracking and donor manage APIs', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const listing = await createDonorListing(donor, 'FR10 Legacy Draft Hidden Item');

    // This simulates an older/local row that was created before the FR10 change removed
    // draft from the donor-facing workflow.
    await query(`UPDATE listings SET status = 'draft' WHERE uuid = $1`, [listing.uuid]);

    const tracking = await request('/api/listings/mine/tracking', { headers: { cookie: donor.cookie } });
    assert.equal(tracking.response.status, 200);
    assert.equal((tracking.body.listings as Array<{ uuid: string }>).some(l => l.uuid === listing.uuid), false);

    const mine = await request('/api/listings/mine', { headers: { cookie: donor.cookie } });
    assert.equal(mine.response.status, 200);
    assert.equal((mine.body.data as Array<{ uuid: string }>).some(l => l.uuid === listing.uuid), false);
  });

  test('admin can request changes; donor edit resubmits it to the admin queue', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 Changes Item');

    // Reason is required and must be substantive.
    const tooShort = await postJson(`/api/listings/${listing.uuid}/request-changes`, { reason: 'no' }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
    assert.equal(tooShort.response.status, 400);

    const changes = await postJson(
      `/api/listings/${listing.uuid}/request-changes`,
      { reason: 'Please add clearer photos and a full description.' },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(changes.response.status, 200);
    assert.equal(changes.body.status, 'changes_requested');
    assert.match(changes.body.review_note as string, /clearer photos/i);

    // Donor edits (resubmits) → back to pending, note cleared.
    const edit = await request(`/api/listings/${listing.uuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: donor.cookie, 'x-csrf-token': donor.csrf },
      body: JSON.stringify({ title: 'SFR09 Changes Item (revised)' }),
    });
    assert.equal(edit.response.status, 200);
    assert.equal(edit.body.status, 'pending');
  });

  test('charity approval re-anchors an expired auction window instead of deadlocking', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');
    const charity = await loginAs('charity@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 Expired Window Item');
    await postJson(`/api/listings/${listing.uuid}/approve`, {}, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });

    // Simulate a long admin+charity review: the donor's original auction window has already elapsed.
    await query(
      `UPDATE listings SET start_time = NOW() - INTERVAL '5 days', end_time = NOW() - INTERVAL '4 days' WHERE uuid = $1`,
      [listing.uuid],
    );

    // Charity approval must still publish (no deadlock) and re-anchor the window into the future.
    const approve = await postJson(
      `/api/listings/${listing.uuid}/charity-review`,
      { decision: 'approved' },
      { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    );
    assert.equal(approve.response.status, 200);
    assert.equal(approve.body.status, 'active');
    assert.ok(new Date(approve.body.end_time as string).getTime() > Date.now());
  });

  test('rejected listings show the reason and donor edit resubmits them for review', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 Rejected Resubmit Item');

    // A rejection reason is mandatory and must be substantive (≥5 chars).
    const tooShort = await postJson(`/api/listings/${listing.uuid}/reject`, { reason: 'no' }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
    assert.equal(tooShort.response.status, 400);

    const reason = 'Prohibited item — cannot be listed on this platform.';
    const reject = await postJson(
      `/api/listings/${listing.uuid}/reject`,
      { reason },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(reject.response.status, 200);
    assert.equal(reject.body.status, 'rejected');
    // Attribution: the reject was made at the admin stage.
    assert.equal(reject.body.review_stage, 'admin');

    // FR10: rejected listings remain visible in My Listings with the rejection note,
    // so the donor knows what to fix before resubmitting.
    const trackingBeforeEdit = await request('/api/listings/mine/tracking', { headers: { cookie: donor.cookie } });
    const rejectedItem = (trackingBeforeEdit.body.listings as { uuid: string; status: string; review_note?: string; canEdit: boolean }[])
      .find(l => l.uuid === listing.uuid);
    assert.equal(rejectedItem?.status, 'rejected');
    assert.equal(rejectedItem?.review_note, reason);
    assert.equal(rejectedItem?.canEdit, true);

    // Donor editing a rejected listing is the resubmission path. The backend moves it
    // back to pending so it re-enters the admin → charity review workflow.
    const edit = await request(`/api/listings/${listing.uuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: donor.cookie, 'x-csrf-token': donor.csrf },
      body: JSON.stringify({
        title: 'SFR09 Rejected Resubmit Item (fixed)',
        description: 'Updated donated item description after reviewing the rejection reason.',
      }),
    });
    assert.equal(edit.response.status, 200);
    assert.equal(edit.body.status, 'pending');
    assert.equal(edit.body.review_note, undefined);
    assert.equal(edit.body.review_stage, undefined);

    const mine = await request('/api/listings/mine', { headers: { cookie: donor.cookie } });
    const found = (mine.body.data as { uuid: string; status: string; title: string }[]).find(l => l.uuid === listing.uuid);
    assert.equal(found?.status, 'pending');
    assert.equal(found?.title, 'SFR09 Rejected Resubmit Item (fixed)');
  });

  test('enforces RBAC and stage ordering on the review endpoints', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');
    const bidder = await loginAs('bidder@bidforgood.test');
    const charity = await loginAs('charity@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 RBAC Item');

    // Non-admins cannot run the admin stage.
    const bidderApprove = await postJson(`/api/listings/${listing.uuid}/approve`, {}, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf });
    assert.equal(bidderApprove.response.status, 403);
    const donorRequest = await postJson(`/api/listings/${listing.uuid}/request-changes`, { reason: 'donor should not do this' }, { cookie: donor.cookie, 'x-csrf-token': donor.csrf });
    assert.equal(donorRequest.response.status, 403);

    // A bidder cannot use the charity review endpoint at all.
    const bidderCharity = await postJson(`/api/listings/${listing.uuid}/charity-review`, { decision: 'approved' }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf });
    assert.equal(bidderCharity.response.status, 403);

    // The charity cannot approve a listing the admin has not forwarded yet.
    const prematureCharity = await postJson(`/api/listings/${listing.uuid}/charity-review`, { decision: 'approved' }, { cookie: charity.cookie, 'x-csrf-token': charity.csrf });
    assert.equal(prematureCharity.response.status, 400);
    assert.equal(prematureCharity.body.code, 'LISTING_NOT_PENDING_REVIEW');
  });
});
