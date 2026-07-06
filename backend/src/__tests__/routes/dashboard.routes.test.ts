import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  loginAs,
} from '../helpers/setup';

type Body = Record<string, unknown>;

beforeAll(startServer);
afterAll(stopServer);

describe('FR18 — Donor Dashboard', () => {
  test('returns donor listings with stats', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const res = await request('/api/listings/donor', {
      headers: { cookie: donor.cookie },
    });
    const body = res.body as Body;
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(body.listings));
    assert.ok(body.stats);
    assert.equal(typeof (body.stats as Body).total, 'number');
  });

  test('rejects non-donor access', async () => {
    const bidder = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/listings/donor', {
      headers: { cookie: bidder.cookie },
    });
    assert.equal(res.response.status, 403);
  });
});

describe('FR19 — Bidder Dashboard', () => {
  test('returns bidder bids with stats', async () => {
    const bidder = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/bids/bidder', {
      headers: { cookie: bidder.cookie },
    });
    const body = res.body as Body;
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(body.bids));
    assert.ok(body.stats);
    assert.equal(typeof (body.stats as Body).total, 'number');
  });

  test('rejects non-bidder access', async () => {
    const donor = await loginAs('donor@bidforgood.test');
    const res = await request('/api/bids/bidder', {
      headers: { cookie: donor.cookie },
    });
    assert.equal(res.response.status, 403);
  });
});

describe('FR20 — Charity Dashboard', () => {
  test('returns charity dashboard with listings and stats', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await request('/api/charities/dashboard', {
      headers: { cookie: charity.cookie },
    });
    const body = res.body as Body;
    assert.equal(res.response.status, 200);
    assert.ok(body.charity);
    assert.ok(Array.isArray(body.listings));
    assert.ok(body.stats);
  });
});

describe('FR21 — Admin Dashboard', () => {
  test('returns admin stats', async () => {
    const admin = await loginAs('admin@bidforgood.test');
    const res = await request('/api/admin/stats', {
      headers: { cookie: admin.cookie },
    });
    const body = res.body as Body;
    assert.equal(res.response.status, 200);
    assert.equal(typeof body.totalUsers, 'number');
    assert.equal(typeof body.totalListings, 'number');
    assert.equal(typeof body.totalBids, 'number');
  });

  test('rejects non-admin access', async () => {
    const bidder = await loginAs('bidder@bidforgood.test');
    const res = await request('/api/admin/stats', {
      headers: { cookie: bidder.cookie },
    });
    assert.equal(res.response.status, 403);
  });
});
