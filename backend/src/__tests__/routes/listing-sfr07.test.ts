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
