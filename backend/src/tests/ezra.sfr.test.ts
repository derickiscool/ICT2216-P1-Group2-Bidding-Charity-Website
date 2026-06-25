import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test, before, after } from 'node:test';
import { createApp } from '../app';
import { getPendingRegistration, resetRepositoryForTests, savePendingRegistration } from '../repositories/inMemory.repository';
import { getJwtSecret } from '../services/session.service';
import { clearDevOtpForTest, readDevOtpForTest } from '../services/otpDelivery.service';

let server: Server;
let baseUrl = '';

const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const setCookie = response.headers.get('set-cookie') ?? undefined;
  const csrf = response.headers.get('x-csrf-token') ?? undefined;
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body: body as any, setCookie, csrf };
};

const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const loginAs = async (email: string, password = 'S3cure!Pass2026') => {
  const login = await postJson('/api/auth/login', { email, password });
  assert.equal(login.response.status, 200);
  assert.ok(login.setCookie);
  assert.ok(login.csrf);
  return { cookie: login.setCookie!.split(';')[0], csrf: login.csrf! };
};

const registerVerifiedUser = async (input: {
  email: string;
  username: string;
  full_name: string;
  password: string;
  roles: string[];
}) => {
  const start = await postJson('/api/auth/register', input);
  assert.equal(start.response.status, 202);
  const otp = readDevOtpForTest(input.email);
  assert.match(String(otp), /^\d{6}$/);
  const verified = await postJson('/api/auth/register/verify', { email: input.email, otp });
  assert.equal(verified.response.status, 201);
  return verified.body.user;
};

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-ci';
  clearDevOtpForTest();
  await resetRepositoryForTests();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr === 'object' && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('SFR02 login uses HttpOnly cookie sessions and rejects invalid credentials generically', async () => {
  const bad = await postJson('/api/auth/login', { email: 'admin@bidforgood.test', password: 'wrong' });
  assert.equal(bad.response.status, 401);
  assert.equal(bad.body.message, 'Invalid email or password');

  const ok = await postJson('/api/auth/login', { email: 'bidder@bidforgood.test', password: 'S3cure!Pass2026' });
  assert.equal(ok.response.status, 200);
  assert.ok(ok.setCookie?.includes('HttpOnly'));
  assert.ok(ok.setCookie?.includes('SameSite=Strict'));
  assert.ok(ok.csrf);
  assert.equal(ok.body.token, undefined);
});

test('SFR02 authentication rejects Authorization Bearer token when cookie is absent', async () => {
  const ok = await postJson('/api/auth/login', { email: 'bidder@bidforgood.test', password: 'S3cure!Pass2026' });
  const token = ok.setCookie!.split(';')[0].split('=').slice(1).join('=');

  const bearerOnly = await request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(bearerOnly.response.status, 401);
});

test('SFR02 account is temporarily locked after five consecutive failed logins', async () => {
  const email = 'lockoutuser@example.com';
  const password = 'correcthorsebatterystaple5';
  await registerVerifiedUser({ email, username: 'lockoutuser', full_name: 'Lockout User', password, roles: ['bidder'] });

  for (let index = 0; index < 5; index += 1) {
    const failed = await postJson('/api/auth/login', { email, password: `wrong-password-${index}` });
    assert.equal(failed.response.status, 401);
    assert.equal(failed.body.message, 'Invalid email or password');
  }

  const locked = await postJson('/api/auth/login', { email, password });
  assert.equal(locked.response.status, 429);
  assert.match(locked.body.message, /Too many failed login attempts/i);
});

test('SFR01 registration blocks breached passwords and suppresses duplicate-email enumeration', async () => {
  const weak = await postJson('/api/auth/register', {
    email: 'weak@example.com', username: 'weakuser', full_name: 'Weak User', password: 'Password123!', roles: ['bidder']
  });
  assert.equal(weak.response.status, 400);
  assert.match(weak.body.errors.password, /breached|common/i);

  const validNew = await postJson('/api/auth/register', {
    email: 'newperson@example.com', username: 'newperson', full_name: 'New Person', password: 'correcthorsebatterystaple', roles: ['bidder']
  });
  const dup = await postJson('/api/auth/register', {
    email: 'admin@bidforgood.test', username: 'someone', full_name: 'Someone', password: 'correcthorsebatterystaple', roles: ['bidder']
  });

  assert.equal(validNew.response.status, 202);
  assert.equal(dup.response.status, 202);
  assert.deepEqual(Object.keys(validNew.body).sort(), ['message']);
  assert.deepEqual(Object.keys(dup.body).sort(), ['message']);
  assert.deepEqual(validNew.body, dup.body);
});

test('SFR01 OTP verification creates account once, invalidates used OTP, expires old OTP, and locks after three failures', async () => {
  const email = 'otpuser@example.com';
  const start = await postJson('/api/auth/register', {
    email, username: 'otpuser', full_name: 'OTP User', password: 'correcthorsebatterystaple2', roles: ['bidder']
  });
  assert.equal(start.response.status, 202);
  const otp = readDevOtpForTest(email);
  assert.match(String(otp), /^\d{6}$/);

  const verified = await postJson('/api/auth/register/verify', { email, otp });
  assert.equal(verified.response.status, 201);
  assert.equal(verified.body.user.email, email);

  const reused = await postJson('/api/auth/register/verify', { email, otp });
  assert.equal(reused.response.status, 400);
  assert.equal(reused.body.code, 'REGISTRATION_VERIFICATION_FAILED');

  const expiringEmail = 'expiredotp@example.com';
  await postJson('/api/auth/register', {
    email: expiringEmail, username: 'expiredotp', full_name: 'Expired OTP', password: 'correcthorsebatterystaple3', roles: ['bidder']
  });
  const pending = await getPendingRegistration(expiringEmail);
  assert.ok(pending);
  pending.expiresAt = new Date(Date.now() - 1000);
  await savePendingRegistration(pending);
  const expired = await postJson('/api/auth/register/verify', { email: expiringEmail, otp: readDevOtpForTest(expiringEmail) });
  assert.equal(expired.response.status, 400);

  const lockEmail = 'lockedotp@example.com';
  await postJson('/api/auth/register', {
    email: lockEmail, username: 'lockedotp', full_name: 'Locked OTP', password: 'correcthorsebatterystaple4', roles: ['bidder']
  });
  assert.equal((await postJson('/api/auth/register/verify', { email: lockEmail, otp: '000000' })).response.status, 400);
  assert.equal((await postJson('/api/auth/register/verify', { email: lockEmail, otp: '000001' })).response.status, 400);
  const locked = await postJson('/api/auth/register/verify', { email: lockEmail, otp: '000002' });
  assert.equal(locked.response.status, 429);
});

test('SFR12 and SFR13 public listing search hides pending listings and rejects SQL-like syntax', async () => {
  const active = await request('/api/listings');
  assert.equal(active.response.status, 200);
  assert.ok(active.body.data.every((listing: { status: string }) => listing.status === 'active'));
  assert.equal(active.body.data.some((listing: { title: string }) => listing.title.includes('Pending')), false);

  const unsafe = await request('/api/listings?q=%27%20OR%201%3D1--');
  assert.equal(unsafe.response.status, 400);
  assert.equal(unsafe.body.code, 'UNSAFE_SEARCH_QUERY');
});

test('SFR10 bidding requires CSRF, enforces minimum increment and accepts valid sequential bid', async () => {
  const { cookie, csrf } = await loginAs('bidder@bidforgood.test');
  const listings = await request('/api/listings');
  const listing = listings.body.data[0];

  const noCsrf = await postJson('/api/bids', { listing_id: listing.id, amount: listing.current_bid + listing.min_increment }, { cookie });
  assert.equal(noCsrf.response.status, 403);

  const low = await postJson('/api/bids', { listing_id: listing.id, amount: listing.current_bid }, { cookie, 'x-csrf-token': csrf });
  assert.equal(low.response.status, 400);

  const valid = await postJson('/api/bids', { listing_id: listing.id, amount: listing.current_bid + listing.min_increment }, { cookie, 'x-csrf-token': csrf });
  assert.equal(valid.response.status, 201);

  const next = await postJson('/api/bids', { listing_id: listing.id, amount: listing.current_bid + listing.min_increment * 2 }, { cookie, 'x-csrf-token': csrf });
  assert.equal(next.response.status, 201);
});

test('SFR10 serialises same-listing bids and rejects automated bid flooding', async () => {
  const admin = await loginAs('admin@bidforgood.test');
  const bidder = await loginAs('bidder@bidforgood.test');

  const concurrentListing = await postJson('/api/listings', {
    title: 'Concurrent Bid Test',
    description: 'Listing used to prove same-amount concurrent bids cannot both win.',
    category: 'Art',
    charityName: 'Valid Charity',
    starting_price: 500,
    min_increment: 25,
    durationHours: 24
  }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
  assert.equal(concurrentListing.response.status, 201);

  const concurrentAmount = concurrentListing.body.current_bid + concurrentListing.body.min_increment;
  const concurrentResults = await Promise.all([
    postJson('/api/bids', { listing_id: concurrentListing.body.id, amount: concurrentAmount }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf }),
    postJson('/api/bids', { listing_id: concurrentListing.body.id, amount: concurrentAmount }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf })
  ]);
  assert.deepEqual(concurrentResults.map(result => result.response.status).sort(), [201, 400]);

  const floodListing = await postJson('/api/listings', {
    title: 'Bid Flood Test',
    description: 'Listing used to prove automated bid flooding is rejected.',
    category: 'Art',
    charityName: 'Valid Charity',
    starting_price: 1000,
    min_increment: 10,
    durationHours: 24
  }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
  assert.equal(floodListing.response.status, 201);

  let amount = floodListing.body.current_bid;
  for (let index = 0; index < 10; index += 1) {
    amount += floodListing.body.min_increment;
    const accepted = await postJson('/api/bids', { listing_id: floodListing.body.id, amount }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf });
    assert.equal(accepted.response.status, 201);
  }
  const flooded = await postJson('/api/bids', { listing_id: floodListing.body.id, amount: amount + floodListing.body.min_increment }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf });
  assert.equal(flooded.response.status, 429);
  assert.equal(flooded.body.code, 'BID_FLOOD_REJECTED');
});

test('SFR04 and SFR05 charity registration rejects unsafe or oversized documents and requires one-time admin review', async () => {
  const charity = await loginAs('charity@bidforgood.test');
  const bidder = await loginAs('bidder@bidforgood.test');

  const bidderForm = new FormData();
  bidderForm.set('organisationName', 'Bidder Charity Attempt');
  bidderForm.set('description', 'A bidder should not be able to register charity documents.');
  bidderForm.set('supportingDocument', new Blob(['%PDF-1.4\nproof'], { type: 'application/pdf' }), 'proof.pdf');
  const bidderRejected = await request('/api/charities/register', { method: 'POST', headers: { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf }, body: bidderForm });
  assert.equal(bidderRejected.response.status, 403);

  const badForm = new FormData();
  badForm.set('organisationName', 'Unsafe Charity');
  badForm.set('description', 'A charity registration with unsafe document.');
  badForm.set('supportingDocument', new Blob(['MZ executable'], { type: 'application/pdf' }), 'proof.pdf');
  const badDoc = await request('/api/charities/register', { method: 'POST', headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf }, body: badForm });
  assert.equal(badDoc.response.status, 400);
  assert.equal(badDoc.body.code, 'UNSUPPORTED_DOCUMENT');

  const oversizedForm = new FormData();
  oversizedForm.set('organisationName', 'Oversized Charity');
  oversizedForm.set('description', 'A charity registration with oversized document.');
  oversizedForm.set('supportingDocument', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf');
  const oversized = await request('/api/charities/register', { method: 'POST', headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf }, body: oversizedForm });
  assert.equal(oversized.response.status, 400);
  assert.equal(oversized.body.code, 'UPLOAD_REJECTED');

  const goodForm = new FormData();
  goodForm.set('organisationName', 'Valid Charity');
  goodForm.set('description', 'A valid charity registration with PDF proof.');
  goodForm.set('supportingDocument', new Blob(['%PDF-1.4\nproof'], { type: 'application/pdf' }), 'proof.pdf');
  const pending = await request('/api/charities/register', { method: 'POST', headers: { cookie: charity.cookie, 'x-csrf-token': charity.csrf }, body: goodForm });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.body.status, 'pending');

  const admin = await loginAs('admin@bidforgood.test');
  const bidderReview = await postJson(`/api/charities/${pending.body.uuid}/review`, { decision: 'approved' }, { cookie: bidder.cookie, 'x-csrf-token': bidder.csrf });
  assert.equal(bidderReview.response.status, 403);

  const reviewed = await postJson(`/api/charities/${pending.body.uuid}/review`, { decision: 'approved' }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.status, 'approved');

  const reviewedAgain = await postJson(`/api/charities/${pending.body.uuid}/review`, { decision: 'rejected', reason: 'second review' }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
  assert.equal(reviewedAgain.response.status, 400);
  assert.equal(reviewedAgain.body.code, 'CHARITY_ALREADY_REVIEWED');
});

test('SFR08 active auction configuration fields are locked after activation including camelCase aliases', async () => {
  const admin = await loginAs('admin@bidforgood.test');

  const created = await postJson('/api/listings', {
    title: 'Active Config Test', description: 'Listing used to test locked active fields.', category: 'Art',
    charityName: 'Valid Charity', starting_price: 100, min_increment: 10, durationHours: 24
  }, { cookie: admin.cookie, 'x-csrf-token': admin.csrf });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.status, 'active');

  const locked = await request(`/api/listings/${created.body.uuid}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: admin.cookie, 'x-csrf-token': admin.csrf },
    body: JSON.stringify({ startingPrice: 1, endTime: new Date().toISOString() })
  });
  assert.equal(locked.response.status, 403);
  assert.match(locked.body.message, /locked/i);
});

test('Session configuration fails securely when production JWT_SECRET is missing or too short', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env.JWT_SECRET = 'short';
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env.NODE_ENV = oldNodeEnv;
  if (oldSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = oldSecret;
});
