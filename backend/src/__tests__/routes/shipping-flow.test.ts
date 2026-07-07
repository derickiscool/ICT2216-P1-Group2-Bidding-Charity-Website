import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  loginAs,
} from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

describe('FR15 — Force-close and Payment Creation', () => {
  test('rejects non-admin force-close', async () => {
    const listings = await request('/api/listings');
    const active = (listings.body as { data: Array<{ uuid: string }> }).data[0];
    const bidder = await loginAs('bidder@bidforgood.test');
    const res = await postJson(`/api/listings/${active.uuid}/force-close`, {}, {
      cookie: bidder.cookie, 'x-csrf-token': bidder.csrf,
    });
    assert.equal(res.response.status, 403);
  });

  test('admin can force-close an active listing', async () => {
    const listings = await request('/api/listings');
    const active = (listings.body as { data: Array<{ uuid: string; title: string }> }).data[0];
    const admin = await loginAs('admin@bidforgood.test');
    const res = await postJson(`/api/listings/${active.uuid}/force-close`, {}, {
      cookie: admin.cookie, 'x-csrf-token': admin.csrf,
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.processed, 1);
  });
});

describe('FR17 — Shipping Guards', () => {
  test('non-donor cannot provide shipping', async () => {
    const listings = await request('/api/listings');
    const active = (listings.body as { data: Array<{ uuid: string }> }).data[0];
    const bidder = await loginAs('bidder@bidforgood.test');
    const res = await postJson(`/api/listings/${active.uuid}/shipping`,
      { tracking_number: 'TEST', courier: 'TEST' },
      { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    );
    assert.equal(res.response.status, 403);
  });

  test('confirm delivery fails when shipping not arranged', async () => {
    const listings = await request('/api/listings');
    const active = (listings.body as { data: Array<{ uuid: string }> }).data[0];
    const admin = await loginAs('admin@bidforgood.test');
    const res = await postJson(`/api/listings/${active.uuid}/confirm-delivery`, {}, {
      cookie: admin.cookie, 'x-csrf-token': admin.csrf,
    });
    // Admin can attempt confirm (has bidder capability), but shipping isn't arranged
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'SHIPPING_NOT_ARRANGED');
  });
});
