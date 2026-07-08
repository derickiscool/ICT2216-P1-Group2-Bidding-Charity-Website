import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  loginAs,
  createActiveListing,
  registerVerifiedUser,
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

  test('rejects other malformed-syntax and SQL-injection query variants', async () => {
    const unsafeQueries = [
      "1 UNION SELECT username, password FROM users",
      "test; DROP TABLE listings;",
      "test/*comment*/attack",
      "O'Brien", // unbalanced/bare quote with no keyword — still rejected as unsafe syntax
      "1 AND 1=1",
      "SLEEP(5)",
    ];
    for (const q of unsafeQueries) {
      const res = await request(`/api/listings?q=${encodeURIComponent(q)}`);
      assert.equal(res.response.status, 400, `expected rejection for query: ${q}`);
      assert.equal(res.body.code, 'UNSAFE_SEARCH_QUERY');
    }

    // The category filter is validated with the same rules as the search query.
    const categoryInjection = await request(
      `/api/listings?category=${encodeURIComponent("Art' OR '1'='1")}`,
    );
    assert.equal(categoryInjection.response.status, 400);
    assert.equal(categoryInjection.body.code, 'UNSAFE_SEARCH_QUERY');

    // A benign query with ordinary punctuation must still be accepted.
    const safe = await request(`/api/listings?q=${encodeURIComponent('vintage watch, gold')}`);
    assert.equal(safe.response.status, 200);
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

const PASSWORD = 'S3cure!Pass2026';

type Session = { cookie: string; csrf: string };

const authHeaders = (session: Session) => ({ cookie: session.cookie, 'x-csrf-token': session.csrf });

const patchJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const deleteReq = (path: string, headers: Record<string, string> = {}) =>
  request(path, { method: 'DELETE', headers });

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const fakePngBytes = (): Uint8Array => new Uint8Array([...PNG_SIGNATURE, ...Buffer.from('minimal png payload')]);

const listingFields = (overrides: Record<string, string> = {}): Record<string, string> => ({
  title: 'SFR07 Donated Item',
  description: 'A donated auction item with a perfectly ordinary description.',
  category: 'Art',
  charityName: 'Valid Charity',
  starting_price: '100',
  min_increment: '10',
  durationHours: '24',
  ...overrides,
});

const postListingForm = async (
  session: Session,
  fields: Record<string, string>,
  files: Array<{ bytes: Uint8Array | Buffer; type: string; name: string }> = [],
) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const file of files) form.append('images', new Blob([file.bytes], { type: file.type }), file.name);
  return request('/api/listings', { method: 'POST', headers: authHeaders(session), body: form });
};

describe('SFR07 — donors create, edit, and delete their own listings', () => {
  test('donor creates a listing with a valid image and later edits and deletes it', async () => {
    const donor = await loginAs('donor@bidforgood.test');

    const created = await postListingForm(donor, listingFields(), [
      { bytes: fakePngBytes(), type: 'image/png', name: 'item.png' },
    ]);
    assert.equal(created.response.status, 201);
    assert.equal(created.body.status, 'pending');
    const images = created.body.images as unknown as string[];
    assert.equal(images.length, 1);
    assert.match(images[0], /^data:image\/png;base64,/);
    const uuid = created.body.uuid;

    const edited = await patchJson(
      `/api/listings/${uuid}`,
      { title: 'SFR07 Edited Item', description: 'The donor refined this description after feedback.' },
      authHeaders(donor),
    );
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.title, 'SFR07 Edited Item');
    // An edit without image fields must keep the uploaded image.
    assert.equal((edited.body.images as unknown as string[]).length, 1);

    const deleted = await deleteReq(`/api/listings/${uuid}`, authHeaders(donor));
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.status, 'cancelled');
  });

  test('non-donors and strangers cannot create or modify listings', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const created = await postJson('/api/listings', listingFields(), authHeaders(donor));
    assert.equal(created.response.status, 201);
    const uuid = created.body.uuid;

    const anon = await postJson('/api/listings', listingFields());
    assert.equal(anon.response.status, 401);

    const bidder = await loginAs('bidder@bidforgood.test');
    const bidderCreate = await postJson('/api/listings', listingFields(), authHeaders(bidder));
    assert.equal(bidderCreate.response.status, 403);

    // A different donor account must not be able to edit or delete this listing.
    const otherEmail = 'sfr07-other-donor@example.com';
    await registerVerifiedUser({ email: otherEmail, username: 'sfr07otherdonor', full_name: 'Other Donor', password: PASSWORD, roles: ['donor'] });
    const otherDonor = await loginAs(otherEmail, PASSWORD);

    const strangerEdit = await patchJson(
      `/api/listings/${uuid}`,
      { title: 'Hijacked Listing Title' },
      authHeaders(otherDonor),
    );
    assert.equal(strangerEdit.response.status, 403);

    const strangerDelete = await deleteReq(`/api/listings/${uuid}`, authHeaders(otherDonor));
    assert.equal(strangerDelete.response.status, 403);
  });
});

describe('SFR07 — script-like descriptions are rejected, other text is sanitized', () => {
  test('rejects descriptions and titles containing script content', async () => {
    const donor = await loginAs('donor@bidforgood.test');

    const scriptDescription = await postJson(
      '/api/listings',
      listingFields({ description: 'Nice item <script>alert(document.cookie)</script> you should bid.' }),
      authHeaders(donor),
    );
    assert.equal(scriptDescription.response.status, 400);
    assert.equal(scriptDescription.body.code, 'UNSAFE_TEXT_CONTENT');

    const eventHandlerTitle = await postJson(
      '/api/listings',
      listingFields({ title: 'Rare vase <img src=x onerror=alert(1)>' }),
      authHeaders(donor),
    );
    assert.equal(eventHandlerTitle.response.status, 400);
    assert.equal(eventHandlerTitle.body.code, 'UNSAFE_TEXT_CONTENT');

    const javascriptUrl = await postJson(
      '/api/listings',
      listingFields({ description: 'Click here javascript:alert(1) for more item details today.' }),
      authHeaders(donor),
    );
    assert.equal(javascriptUrl.response.status, 400);
    assert.equal(javascriptUrl.body.code, 'UNSAFE_TEXT_CONTENT');

    // Editing an existing listing is held to the same standard as creating one.
    const created = await postJson('/api/listings', listingFields(), authHeaders(donor));
    assert.equal(created.response.status, 201);
    const editWithScript = await patchJson(
      `/api/listings/${created.body.uuid}`,
      { description: 'Updated item <iframe src=//evil.example></iframe> description.' },
      authHeaders(donor),
    );
    assert.equal(editWithScript.response.status, 400);
    assert.equal(editWithScript.body.code, 'UNSAFE_TEXT_CONTENT');
  });

  test('non-script markup and metacharacters are stored HTML-escaped', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const res = await postJson(
      '/api/listings',
      listingFields({ description: 'Antique "cabinet" with <b>brass</b> handles & carved legs, 1900s.' }),
      authHeaders(donor),
    );
    assert.equal(res.response.status, 201);
    const description = String(res.body.description);
    assert.ok(!description.includes('<') && !description.includes('"'), `raw metacharacters stored: ${description}`);
    assert.match(description, /&lt;b&gt;/);
  });

  test('slash-delimited event handlers are rejected like the other script forms', async () => {
    // `<svg/onload=...>` uses `/` as the attribute separator, so the reject pattern
    // must anchor on `/` as well as whitespace and quotes.
    const donor = await loginAs('donor@bidforgood.test');
    const res = await postJson(
      '/api/listings',
      listingFields({ description: 'Vintage clock <svg/onload=alert(1)> from an estate sale collection.' }),
      authHeaders(donor),
    );
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'UNSAFE_TEXT_CONTENT');
  });
});

describe('SFR07 — malicious or malformed files are rejected', () => {
  test('rejects an HTML payload masquerading as a JPEG', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const res = await postListingForm(donor, listingFields(), [
      { bytes: Buffer.from('<html><script>alert(1)</script></html>'), type: 'image/jpeg', name: 'photo.jpg' },
    ]);
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'INVALID_LISTING_IMAGE_SIGNATURE');
  });

  test('rejects disallowed MIME types outright (SVG, executables)', async () => {
    const donor = await loginAs('donor@bidforgood.test');

    const svg = await postListingForm(donor, listingFields(), [
      { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), type: 'image/svg+xml', name: 'image.svg' },
    ]);
    assert.equal(svg.response.status, 400);
    assert.equal(svg.body.code, 'INVALID_LISTING_IMAGE');

    const exe = await postListingForm(donor, listingFields(), [
      { bytes: Buffer.from('MZ\x90\x00 fake executable'), type: 'application/octet-stream', name: 'malware.exe' },
    ]);
    assert.equal(exe.response.status, 400);
    assert.equal(exe.body.code, 'INVALID_LISTING_IMAGE');
  });

  test('rejects oversized images and too many images', async () => {
    const donor = await loginAs('donor@bidforgood.test');

    const oversizedBytes = new Uint8Array(2 * 1024 * 1024 + 1);
    oversizedBytes.set(PNG_SIGNATURE);
    const oversized = await postListingForm(donor, listingFields(), [
      { bytes: oversizedBytes, type: 'image/png', name: 'huge.png' },
    ]);
    assert.equal(oversized.response.status, 400);
    assert.equal(oversized.body.code, 'LIMIT_FILE_SIZE');

    const sixImages = await postListingForm(
      donor,
      listingFields(),
      Array.from({ length: 6 }, (_, i) => ({ bytes: fakePngBytes(), type: 'image/png' as const, name: `img${i}.png` })),
    );
    assert.equal(sixImages.response.status, 400);
  });
});