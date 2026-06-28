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

describe('SFR04/SFR05 — Charity Document Upload & Admin Review', () => {
  test('rejects unsafe or oversized documents and requires one-time admin review', async () => {
  const charity = await loginAs('charity@bidforgood.test');
  const bidder = await loginAs('bidder@bidforgood.test');

  const bidderForm = new FormData();
  bidderForm.set('organisationName', 'Bidder Charity Attempt');
  bidderForm.set(
    'description',
    'A bidder should not be able to register charity documents.',
  );
  bidderForm.set(
    'supportingDocument',
    new Blob(['%PDF-1.4\nproof'], { type: 'application/pdf' }),
    'proof.pdf',
  );
  const bidderRejected = await request('/api/charities/register', {
    method: 'POST',
    headers: { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
    body: bidderForm,
  });
  assert.equal(bidderRejected.response.status, 403);

  const badForm = new FormData();
  badForm.set('organisationName', 'Unsafe Charity');
  badForm.set('description', 'A charity registration with unsafe document.');
  badForm.set(
    'supportingDocument',
    new Blob(['MZ executable'], { type: 'application/pdf' }),
    'proof.pdf',
  );
  const badDoc = await request('/api/charities/register', {
    method: 'POST',
    headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    body: badForm,
  });
  assert.equal(badDoc.response.status, 400);
  assert.equal(badDoc.body.code, 'UNSUPPORTED_DOCUMENT');

  const oversizedForm = new FormData();
  oversizedForm.set('organisationName', 'Oversized Charity');
  oversizedForm.set(
    'description',
    'A charity registration with oversized document.',
  );
  oversizedForm.set(
    'supportingDocument',
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
      type: 'application/pdf',
    }),
    'large.pdf',
  );
  const oversized = await request('/api/charities/register', {
    method: 'POST',
    headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    body: oversizedForm,
  });
  assert.equal(oversized.response.status, 400);
  assert.equal(oversized.body.code, 'UPLOAD_REJECTED');

  const goodForm = new FormData();
  goodForm.set('organisationName', 'Valid Charity');
  goodForm.set('description', 'A valid charity registration with PDF proof.');
  goodForm.set(
    'supportingDocument',
    new Blob(['%PDF-1.4\nproof'], { type: 'application/pdf' }),
    'proof.pdf',
  );
  const pending = await request('/api/charities/register', {
    method: 'POST',
    headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
    body: goodForm,
  });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.body.status, 'pending');

  const admin = await loginAs('admin@bidforgood.test');
  const bidderReview = await postJson(
    `/api/charities/${pending.body.uuid}/review`,
    { decision: 'approved' },
    { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf },
  );
  assert.equal(bidderReview.response.status, 403);

  const reviewed = await postJson(
    `/api/charities/${pending.body.uuid}/review`,
    { decision: 'approved' },
    { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
  );
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.status, 'approved');

  const reviewedAgain = await postJson(
    `/api/charities/${pending.body.uuid}/review`,
    { decision: 'rejected', reason: 'second review' },
    { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
  );
  assert.equal(reviewedAgain.response.status, 400);
  assert.equal(reviewedAgain.body.code, 'CHARITY_ALREADY_REVIEWED');
  });
});
