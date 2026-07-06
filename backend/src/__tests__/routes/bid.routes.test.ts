import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  loginAs,
  registerVerifiedUser,
} from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

describe('SFR10 — Bid Validation & Flood Protection', () => {
  test('requires CSRF token, enforces minimum increment, and accepts valid sequential bids', async () => {
    const { cookie, csrf } = await loginAs('bidder@bidforgood.test');
    const listings = await request('/api/listings');
    const listing = listings.body.data[0];

    const noCsrf = await postJson(
      '/api/bids',
      {
        listing_id: listing.id,
        amount: listing.current_bid + listing.min_increment,
      },
      { cookie },
    );
    assert.equal(noCsrf.response.status, 403);

    const low = await postJson(
      '/api/bids',
      { listing_id: listing.id, amount: listing.current_bid },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(low.response.status, 400);

    const valid = await postJson(
      '/api/bids',
      {
        listing_id: listing.id,
        amount: listing.current_bid + listing.min_increment,
      },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(valid.response.status, 201);

    const next = await postJson(
      '/api/bids',
      {
        listing_id: listing.id,
        amount: listing.current_bid + listing.min_increment * 2,
      },
      { cookie, 'x-csrf-token': csrf },
    );
    assert.equal(next.response.status, 201);
  });

  test('serialises concurrent same-listing bids and rejects automated bid flooding', async () => {
    const admin = await loginAs('admin@bidforgood.test');
    const bidder = await loginAs('bidder@bidforgood.test');

    const concurrentListing = await postJson(
      '/api/listings',
      {
        title: 'Concurrent Bid Test',
        description: 'Listing used to prove same-amount concurrent bids cannot both win.',
        category: 'Art',
        charityName: 'Valid Charity',
        starting_price: 500,
        min_increment: 25,
        durationHours: 24,
      },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(concurrentListing.response.status, 201);

    const concurrentAmount =
      concurrentListing.body.current_bid + concurrentListing.body.min_increment;
    const concurrentResults = await Promise.all([
      postJson(
        '/api/bids',
        { listing_id: concurrentListing.body.id, amount: concurrentAmount },
        { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
      ),
      postJson(
        '/api/bids',
        { listing_id: concurrentListing.body.id, amount: concurrentAmount },
        { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
      ),
    ]);
    assert.deepEqual(
      concurrentResults.map((result) => result.response.status).sort(),
      [201, 400],
    );

    const floodListing = await postJson(
      '/api/listings',
      {
        title: 'Bid Flood Test',
        description: 'Listing used to prove automated bid flooding is rejected.',
        category: 'Art',
        charityName: 'Valid Charity',
        starting_price: 1000,
        min_increment: 10,
        durationHours: 24,
      },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(floodListing.response.status, 201);

    let amount = floodListing.body.current_bid;
    for (let index = 0; index < 10; index += 1) {
      amount += floodListing.body.min_increment;
      const accepted = await postJson(
        '/api/bids',
        { listing_id: floodListing.body.id, amount },
        { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
      );
      assert.equal(accepted.response.status, 201);
    }
    const flooded = await postJson(
      '/api/bids',
      { listing_id: floodListing.body.id, amount: amount + floodListing.body.min_increment },
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(flooded.response.status, 429);
    assert.equal(flooded.body.code, 'BID_FLOOD_REJECTED');
  });
});


describe('FR12 — Auto-Bidding', () => {
  test('keeps maximum auto-bid private and automatically responds when outbid', async () => {
    const admin = await loginAs('admin@bidforgood.test');
    const bidderOne = await loginAs('bidder@bidforgood.test');

    await registerVerifiedUser({
      email: 'autobidder2@bidforgood.test',
      username: 'autobidder2',
      full_name: 'Auto Bidder Two',
      password: 'S3cure!Pass2026',
      roles: ['bidder'],
    });
    const bidderTwo = await loginAs('autobidder2@bidforgood.test');

    const listing = await postJson(
      '/api/listings',
      {
        title: 'FR12 Auto-Bid Test',
        description: 'Listing used to prove proxy bidding and private max limits.',
        category: 'Art',
        charityName: 'Valid Charity',
        starting_price: 100,
        min_increment: 10,
        durationHours: 24,
      },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(listing.response.status, 201);

    const autoBid = await postJson(
      '/api/bids/auto-bids',
      { listing_id: listing.body.id, max_amount: 200 },
      { cookie: bidderOne.cookie, 'x-csrf-token': bidderOne.csrf },
    );
    assert.equal(autoBid.response.status, 201);
    const autoBidBody = autoBid.body as unknown as { autoBid: { max_amount: number }; result: { currentBid: number } };
    assert.equal(autoBidBody.autoBid.max_amount, 200);
    assert.equal(autoBidBody.result.currentBid, 110);

    const manualBid = await postJson(
      '/api/bids',
      { listing_id: listing.body.id, amount: 150 },
      { cookie: bidderTwo.cookie, 'x-csrf-token': bidderTwo.csrf },
    );
    assert.equal(manualBid.response.status, 201);
    const manualBidBody = manualBid.body as unknown as { result: { currentBid: number; bids: Array<{ is_auto_bid: boolean }> } };
    assert.equal(manualBidBody.result.currentBid, 160);
    assert.equal(manualBidBody.result.bids.some(bid => bid.is_auto_bid), true);

    const publicBids = await request(`/api/bids/listings/${listing.body.id}`);
    assert.equal(publicBids.response.status, 200);
    assert.equal(publicBids.body.data, undefined);
    assert.equal(JSON.stringify(publicBids.body).includes('max_amount'), false);
  });
});
