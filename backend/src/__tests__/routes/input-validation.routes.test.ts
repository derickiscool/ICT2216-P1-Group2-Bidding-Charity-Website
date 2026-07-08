import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { startServer, stopServer, request, loginAs } from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

describe('FSR12 — Path parameter validation: listing bids (F-002)', () => {
  test('rejects non-numeric, negative, and float listingId values', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const cases = [
      { id: 'abc',  label: 'alphabetic' },
      { id: '-1',   label: 'negative' },
      { id: '1.5',  label: 'float' },
      { id: '0',    label: 'zero' },
    ];

    for (const { id, label } of cases) {
      const res = await request(`/api/bids/listings/${id}`, { headers: { cookie } });
      assert.equal(res.response.status, 400, `expected 400 for ${label} listingId "${id}"`);
      assert.equal(res.body.code, 'INVALID_PARAM', `expected INVALID_PARAM for ${label} listingId`);
    }
  });

  test('accepts a valid positive integer listingId', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    // A non-existent but correctly-formatted ID must reach the DB and return an empty list, not 400
    const res = await request('/api/bids/listings/99999', { headers: { cookie } });
    // Either 200 (empty) or 404 is acceptable — what must NOT happen is 400 or 500
    assert.ok(
      res.response.status === 200 || res.response.status === 404,
      `expected 200 or 404 for valid listingId, got ${res.response.status}`,
    );
    assert.notEqual(res.response.status, 400);
    assert.notEqual(res.response.status, 500);
  });
});

describe('FSR12 — Path parameter validation: receipts (F-003)', () => {
  test('rejects non-UUID identifiers on the receipt endpoints', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');

    const badParams = ['not-a-uuid', "1' OR '1'='1", '123', '../traversal'];

    for (const param of badParams) {
      const byId = await request(`/api/receipts/${encodeURIComponent(param)}`, {
        headers: { cookie },
      });
      assert.equal(byId.response.status, 400, `GET /api/receipts/${param} should be 400`);
      assert.equal(byId.body.code, 'INVALID_PARAM');

      const byPayment = await request(`/api/receipts/by-payment/${encodeURIComponent(param)}`, {
        headers: { cookie },
      });
      assert.equal(byPayment.response.status, 400, `GET /api/receipts/by-payment/${param} should be 400`);
      assert.equal(byPayment.body.code, 'INVALID_PARAM');
    }
  });

  test('accepts a valid UUID format on receipt endpoints (returns 404 for unknown, not 500)', async () => {
    const { cookie } = await loginAs('bidder@bidforgood.test');
    const unknownUuid = '00000000-0000-0000-0000-000000000000';

    const res = await request(`/api/receipts/${unknownUuid}`, { headers: { cookie } });
    assert.notEqual(res.response.status, 400, 'valid UUID must not return 400 INVALID_PARAM');
    assert.notEqual(res.response.status, 500, 'valid UUID must not cause a 500 DB cast error');
  });
});

describe('FSR12 — Path parameter validation: campaign image (unauthenticated, F-004)', () => {
  test('rejects non-UUID campaign UUIDs on the public image endpoint', async () => {
    const badParams = ['not-a-uuid', "1'OR'1'='1", 'abc', '<script>'];

    for (const param of badParams) {
      const res = await request(`/api/charities/campaigns/${encodeURIComponent(param)}/image`);
      assert.equal(res.response.status, 400, `campaign image route should reject "${param}" with 400`);
      assert.equal(res.body.code, 'INVALID_PARAM');
    }
  });

  test('accepts a valid UUID on the campaign image endpoint (returns 404 when no image, not 500)', async () => {
    const unknownUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request(`/api/charities/campaigns/${unknownUuid}/image`);
    assert.notEqual(res.response.status, 400, 'valid UUID must not return 400 INVALID_PARAM');
    assert.notEqual(res.response.status, 500, 'valid UUID must not cause a DB cast error');
  });
});
