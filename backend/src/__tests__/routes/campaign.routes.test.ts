import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import {
  startServer,
  stopServer,
  request,
  postJson,
  putJson,
  loginAs,
  registerVerifiedUser,
} from '../helpers/setup';

beforeAll(startServer);
afterAll(stopServer);

const PASSWORD = 'S3cure!Pass2026';
const STAFF_TEMP_PASSWORD = 'Temp0rary!Staff2026';
const STAFF_NEW_PASSWORD = 'Perm4nent!Staff2026';
const VALID_DESCRIPTION = 'A campaign description that is comfortably over twenty characters long.';

type Session = { cookie: string; csrf: string };

const authHeaders = (session: Session) => ({ cookie: session.cookie, 'x-csrf-token': session.csrf });

const patchJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const createCampaign = async (session: Session, overrides: Record<string, unknown> = {}) =>
  postJson(
    '/api/charities/campaigns',
    { name: 'SFR06 Test Campaign', description: VALID_DESCRIPTION, ...overrides },
    authHeaders(session),
  );

// Registers a fresh charity-role user, submits an organisation registration, and
// has the seeded admin approve it, so the account can manage its own campaigns.
const registerApprovedCharity = async (slug: string): Promise<Session> => {
  const email = `${slug}@example.com`;
  await registerVerifiedUser({ email, username: slug, full_name: `Charity ${slug}`, password: PASSWORD, roles: ['charity'] });
  const session = await loginAs(email, PASSWORD);

  const form = new FormData();
  form.set('organisationName', `Org ${slug}`);
  form.set('description', 'A second organisation used for cross-charity tests.');
  form.set('supportingDocument', new Blob(['%PDF-1.4\nproof'], { type: 'application/pdf' }), 'proof.pdf');
  const pending = await request('/api/charities/register', {
    method: 'POST',
    headers: authHeaders(session),
    body: form,
  });
  assert.equal(pending.response.status, 201);

  const admin = await loginAs('admin@bidforgood.test');
  const reviewed = await postJson(
    `/api/charities/${pending.body.uuid}/review`,
    { decision: 'approved' },
    authHeaders(admin),
  );
  assert.equal(reviewed.response.status, 200);
  return session;
};

describe('SFR06 — charity organisation manages campaigns', () => {
  test('creates a campaign with name, description, and no end date', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, { name: 'Books for All 2026' });

    assert.equal(res.response.status, 201);
    assert.equal(res.body.name, 'Books for All 2026');
    assert.equal(res.body.status, 'active');
    assert.equal(res.body.end_date ?? undefined, undefined);
  });

  test('creates a campaign with an optional end date', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, { name: 'Year End Drive', end_date: '2026-12-31' });

    assert.equal(res.response.status, 201);
    assert.ok(res.body.end_date, 'expected the campaign to keep its end date');
    assert.match(String(res.body.end_date), /2026-12-3/);
  });

  test('edits an owned campaign and closes it exactly once', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const created = await createCampaign(charity, { name: 'Editable Campaign' });
    assert.equal(created.response.status, 201);
    const uuid = created.body.uuid;

    const edited = await putJson(
      `/api/charities/campaigns/${uuid}`,
      { name: 'Edited Campaign Name', description: `${VALID_DESCRIPTION} Updated.` },
      authHeaders(charity),
    );
    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.name, 'Edited Campaign Name');

    const closed = await patchJson(`/api/charities/campaigns/${uuid}/close`, {}, authHeaders(charity));
    assert.equal(closed.response.status, 200);
    assert.equal(closed.body.status, 'closed');

    const editAfterClose = await putJson(
      `/api/charities/campaigns/${uuid}`,
      { name: 'Should Not Apply', description: VALID_DESCRIPTION },
      authHeaders(charity),
    );
    assert.equal(editAfterClose.response.status, 400);
    assert.equal(editAfterClose.body.code, 'CAMPAIGN_CLOSED');

    const closeAgain = await patchJson(`/api/charities/campaigns/${uuid}/close`, {}, authHeaders(charity));
    assert.equal(closeAgain.response.status, 400);
    assert.equal(closeAgain.body.code, 'CAMPAIGN_ALREADY_CLOSED');
  });

  test('rejects names and descriptions that are too short', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, { name: 'Hi', description: 'too short' });

    assert.equal(res.response.status, 400);
    const errors = res.body.errors as unknown as Record<string, string>;
    assert.match(errors.name, /at least 5/i);
    assert.match(errors.description, /at least 20/i);
  });

  test('rejects a malformed end date', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, { name: 'Bad Date Format', end_date: 'tomorrow' });
    assert.equal(res.response.status, 400);
  });

  test('rejects an impossible calendar end date with 400, not a server error', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, { name: 'Impossible Date', end_date: '2026-13-45' });
    assert.equal(res.response.status, 400);
  });
});

describe('SFR06 — charity staff manage their organisation campaigns', () => {
  test('staff can create, edit, and close campaigns for their charity', async () => {
    const owner = await loginAs('charity@bidforgood.test');
    const staffEmail = 'sfr06-staff@example.com';
    const createdStaff = await postJson(
      '/api/charities/staff',
      { full_name: 'SFR06 Staff', email: staffEmail, temporaryPassword: STAFF_TEMP_PASSWORD },
      authHeaders(owner),
    );
    assert.equal(createdStaff.response.status, 201);

    let staff = await loginAs(staffEmail, STAFF_TEMP_PASSWORD);
    const changed = await postJson(
      '/api/auth/force-change-password',
      { currentPassword: STAFF_TEMP_PASSWORD, newPassword: STAFF_NEW_PASSWORD },
      authHeaders(staff),
    );
    assert.equal(changed.response.status, 200);
    staff = await loginAs(staffEmail, STAFF_NEW_PASSWORD);

    const created = await createCampaign(staff, { name: 'Staff Created Campaign' });
    assert.equal(created.response.status, 201);

    const edited = await putJson(
      `/api/charities/campaigns/${created.body.uuid}`,
      { name: 'Staff Edited Campaign', description: VALID_DESCRIPTION },
      authHeaders(staff),
    );
    assert.equal(edited.response.status, 200);

    const closed = await patchJson(`/api/charities/campaigns/${created.body.uuid}/close`, {}, authHeaders(staff));
    assert.equal(closed.response.status, 200);
    assert.equal(closed.body.status, 'closed');
  });
});

describe('SFR06 — unauthorised users must not modify campaigns', () => {
  test('anonymous and bidder requests are rejected', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const created = await createCampaign(charity, { name: 'Protected Campaign' });
    assert.equal(created.response.status, 201);
    const uuid = created.body.uuid;

    const anonCreate = await postJson('/api/charities/campaigns', { name: 'Anon Campaign', description: VALID_DESCRIPTION });
    assert.equal(anonCreate.response.status, 401);

    const bidder = await loginAs('bidder@bidforgood.test');
    const bidderCreate = await createCampaign(bidder);
    assert.equal(bidderCreate.response.status, 403);

    const bidderEdit = await putJson(
      `/api/charities/campaigns/${uuid}`,
      { name: 'Bidder Takeover', description: VALID_DESCRIPTION },
      authHeaders(bidder),
    );
    assert.equal(bidderEdit.response.status, 403);

    const bidderClose = await patchJson(`/api/charities/campaigns/${uuid}/close`, {}, authHeaders(bidder));
    assert.equal(bidderClose.response.status, 403);
  });

  test('a different charity organisation cannot edit or close the campaign', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const created = await createCampaign(charity, { name: 'Cross Tenant Target' });
    assert.equal(created.response.status, 201);
    const uuid = created.body.uuid;

    const otherCharity = await registerApprovedCharity('sfr06othercharity');

    const crossEdit = await putJson(
      `/api/charities/campaigns/${uuid}`,
      { name: 'Hijacked Campaign', description: VALID_DESCRIPTION },
      authHeaders(otherCharity),
    );
    assert.equal(crossEdit.response.status, 404);

    const crossClose = await patchJson(`/api/charities/campaigns/${uuid}/close`, {}, authHeaders(otherCharity));
    assert.equal(crossClose.response.status, 404);
  });
});

describe('SFR06 — campaign fields must not store malicious scripts', () => {
  test('script payloads in name are rejected before storage', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const res = await createCampaign(charity, {
      name: '<script>alert(1)</script> Gala',
      description: 'Charity gala <img src=x onerror=alert(document.cookie)> with dinner and auction.',
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'UNSAFE_TEXT_CONTENT');
    assert.ok(typeof res.body === 'object' && res.body !== null, 'expected a response body');
  });

  test('an SVG disguised as a campaign image is rejected', async () => {
    const charity = await loginAs('charity@bidforgood.test');
    const form = new FormData();
    form.set('name', 'SVG Upload Attempt');
    form.set('description', VALID_DESCRIPTION);
    form.set('image', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/png' }), 'evil.png');

    const res = await request('/api/charities/campaigns', {
      method: 'POST',
      headers: authHeaders(charity),
      body: form,
    });
    assert.equal(res.response.status, 400);
    assert.equal(res.body.code, 'UNSUPPORTED_IMAGE');
  });
});
