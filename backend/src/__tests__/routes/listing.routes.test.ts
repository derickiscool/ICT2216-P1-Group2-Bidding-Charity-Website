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
  const createDonorListing = async (donor: { cookie: string; csrf: string }, title: string) => {
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

  test('reject is terminal — the donor cannot edit or resubmit a rejected listing', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const admin = await loginAs('admin@bidforgood.test');

    const listing = await createDonorListing(donor, 'SFR09 Terminal Reject Item');

    // A rejection reason is mandatory and must be substantive (≥5 chars).
    const tooShort = await postJson(`/api/listings/${listing.uuid}/reject`, { reason: 'no' }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
    assert.equal(tooShort.response.status, 400);

    const reject = await postJson(
      `/api/listings/${listing.uuid}/reject`,
      { reason: 'Prohibited item — cannot be listed on this platform.' },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(reject.response.status, 200);
    assert.equal(reject.body.status, 'rejected');
    // Attribution: the reject was made at the admin stage.
    assert.equal(reject.body.review_stage, 'admin');

    // Donor edit must be refused (403) — reject is final, not a resubmit path.
    const edit = await request(`/api/listings/${listing.uuid}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: donor.cookie, 'x-csrf-token': donor.csrf },
      body: JSON.stringify({ title: 'SFR09 Terminal Reject Item (sneaky resubmit)' }),
    });
    assert.equal(edit.response.status, 403);

    // Status is unchanged — it did NOT bounce back into the admin queue.
    const mine = await request('/api/listings/mine', { headers: { cookie: donor.cookie } });
    const found = (mine.body.data as { uuid: string; status: string }[]).find(l => l.uuid === listing.uuid);
    assert.equal(found?.status, 'rejected');
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
