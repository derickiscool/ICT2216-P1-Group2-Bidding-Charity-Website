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
    const admin = await loginAs('admin@bidforgood.test');

    const created = await postJson(
      '/api/listings',
      {
        title: 'Active Config Test',
        description: 'Listing used to test locked active fields.',
        category: 'Art',
        charityName: 'Valid Charity',
        starting_price: 100,
        min_increment: 10,
        durationHours: 24,
      },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(created.response.status, 201);
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
