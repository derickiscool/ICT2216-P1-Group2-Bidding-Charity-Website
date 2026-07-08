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

  test('accepts genuine PNG and JPEG supporting documents', async () => {
    const charity = await loginAs('charity@bidforgood.test');

    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from('fake png body')]);
    const pngForm = new FormData();
    pngForm.set('organisationName', 'PNG Proof Charity');
    pngForm.set('description', 'A charity registration with a genuine PNG proof.');
    pngForm.set('supportingDocument', new Blob([pngBytes], { type: 'image/png' }), 'proof.png');
    const pngRes = await request('/api/charities/register', {
      method: 'POST',
      headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
      body: pngForm,
    });
    assert.equal(pngRes.response.status, 201);
    assert.equal(pngRes.body.status, 'pending');

    // Only one registration may be pending per user, so the admin must review
    // the PNG registration before the same user can submit the JPEG one.
    const admin = await loginAs('admin@bidforgood.test');
    const pngReview = await postJson(
      `/api/charities/${pngRes.body.uuid}/review`,
      { decision: 'approved' },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(pngReview.response.status, 200);

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from('fake jpeg body')]);
    const jpegForm = new FormData();
    jpegForm.set('organisationName', 'JPEG Proof Charity');
    jpegForm.set('description', 'A charity registration with a genuine JPEG proof.');
    jpegForm.set('supportingDocument', new Blob([jpegBytes], { type: 'image/jpeg' }), 'proof.jpg');
    const jpegRes = await request('/api/charities/register', {
      method: 'POST',
      headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
      body: jpegForm,
    });
    assert.equal(jpegRes.response.status, 201);
    assert.equal(jpegRes.body.status, 'pending');

    // Clear the pending JPEG registration so later tests hit the document
    // validation instead of the one-pending-registration guard.
    const jpegReview = await postJson(
      `/api/charities/${jpegRes.body.uuid}/review`,
      { decision: 'approved' },
      { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    );
    assert.equal(jpegReview.response.status, 200);
  });

  test('rejects a document whose declared MIME type does not match its actual signature', async () => {
    const charity = await loginAs('charity@bidforgood.test');

    // Genuine PNG bytes, but declared as a PDF — the detected/declared mismatch
    // must be rejected even though the bytes themselves match an allowed type.
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from('fake png body')]);
    const mismatchForm = new FormData();
    mismatchForm.set('organisationName', 'Mismatched Mime Charity');
    mismatchForm.set('description', 'A charity registration with a mismatched MIME type.');
    mismatchForm.set('supportingDocument', new Blob([pngBytes], { type: 'application/pdf' }), 'proof.pdf');
    const mismatchRes = await request('/api/charities/register', {
      method: 'POST',
      headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
      body: mismatchForm,
    });
    assert.equal(mismatchRes.response.status, 400);
    assert.equal(mismatchRes.body.code, 'UNSUPPORTED_DOCUMENT');

    // Executable disguised with a PNG extension and MIME type — the byte
    // signature check must still catch it since the bytes aren't a real PNG.
    const exeForm = new FormData();
    exeForm.set('organisationName', 'Executable Disguise Charity');
    exeForm.set('description', 'A charity registration with an executable disguised as PNG.');
    exeForm.set('supportingDocument', new Blob([Buffer.from('MZ\x90\x00 fake executable')], { type: 'image/png' }), 'proof.png');
    const exeRes = await request('/api/charities/register', {
      method: 'POST',
      headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
      body: exeForm,
    });
    assert.equal(exeRes.response.status, 400);
    assert.equal(exeRes.body.code, 'UNSUPPORTED_DOCUMENT');
  });

  test('rejects a file whose first 4 bytes spell %PDF but lacks the mandatory version dash (F-007)', async () => {
    const charity = await loginAs('charity@bidforgood.test');

    // Bytes: 0x25 0x50 0x44 0x46 = '%', 'P', 'D', 'F' — old 4-byte check would accept this;
    // the strengthened 5-byte check requires '%PDF-' and must reject it.
    const fakePdfBytes = Buffer.from('%PDFmalicious content not a real pdf');
    const form = new FormData();
    form.set('organisationName', 'Fake PDF Charity');
    form.set('description', 'A charity registration with a file whose first 4 bytes look like a PDF but the 5th is not a dash.');
    form.set('supportingDocument', new Blob([fakePdfBytes], { type: 'application/pdf' }), 'fake.pdf');

    const res = await request('/api/charities/register', {
      method: 'POST',
      headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf },
      body: form,
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'UNSUPPORTED_DOCUMENT');
  });
});
