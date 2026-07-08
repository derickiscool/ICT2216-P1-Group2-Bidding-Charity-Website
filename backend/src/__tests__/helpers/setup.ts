import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../../app';
import {
  resetRepositoryForTests,
} from '../../repositories/postgres.repository';
import { readDevOtpForTest, clearDevOtpForTest, clearDevPasswordChangeOtpForTest } from '../../services/otpDelivery.service';
import { clearLoginAttemptCacheForTests } from '../../services/loginAttemptCache.service';
import { closePool, query } from '../../utils/db';

export type TestListing = {
  id: number;
  uuid: string;
  title: string;
  status: string;
  current_bid: number;
  min_increment: number;
  [key: string]: unknown;
};

export type ApiResponse = {
  message: string;
  code: string;
  token?: string;
  errors: { password: string };
  user: { email: string; contactNumber?: string };
  data: TestListing[];
  id: number;
  uuid: string;
  status: string;
  current_bid: number;
  min_increment: number;
  [key: string]: unknown;
};

let server: Server;
let baseUrl = '';

export const startServer = async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-ci';
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.MAIL_DELIVERY_DISABLED = 'true';
  delete process.env.LOGIN_ATTEMPT_CACHE;
  delete process.env.REDIS_URL;
  clearDevOtpForTest();
  clearDevPasswordChangeOtpForTest();
  clearLoginAttemptCacheForTests();
  await resetRepositoryForTests();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr === 'object' && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
};

export const stopServer = async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await closePool();
};

export const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const setCookie = response.headers.get('set-cookie') ?? undefined;
  const csrf = response.headers.get('x-csrf-token') ?? undefined;
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as ApiResponse)
    : ({ message: await response.text() } as ApiResponse);
  return { response, body, setCookie, csrf };
};

export const putJson = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

export const postJson = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// Admin accounts require password + a follow-up email OTP; every other role
// completes on the password step alone. Transparently finishes whichever
// applies so callers don't need to know the target account's role.
export const loginAs = async (email: string, password = 'S3cure!Pass2026') => {
  const login = await postJson('/api/auth/login', { email, password });
  assert.equal(login.response.status, 200);

  if (login.body.mfaRequired) {
    const otp = readDevOtpForTest(email);
    assert.match(String(otp), /^\d{6}$/);
    const verified = await postJson('/api/auth/login/passwordless/verify', { email, otp });
    assert.equal(verified.response.status, 200);
    assert.ok(verified.setCookie);
    assert.ok(verified.csrf);
    return { cookie: verified.setCookie!.split(';')[0], csrf: verified.csrf! };
  }

  assert.ok(login.setCookie);
  assert.ok(login.csrf);
  return { cookie: login.setCookie!.split(';')[0], csrf: login.csrf! };
};

// Creates a listing as the donor (the only role allowed to author listings) and activates it
// directly, short-circuiting the two-stage SFR09 review for tests that only need a live auction.
export const createActiveListing = async (
  seller: { cookie: string; csrf: string },
  overrides: Record<string, unknown> = {},
): Promise<TestListing> => {
  const res = await postJson(
    '/api/listings',
    {
      title: 'Active Test Listing',
      description: 'A listing used by tests that require a live auction.',
      category: 'Art',
      charityName: 'Valid Charity',
      starting_price: 500,
      min_increment: 25,
      durationHours: 24,
      ...overrides,
    },
    { cookie: seller.cookie, 'x-csrf-token': seller.csrf },
  );
  assert.equal(res.response.status, 201);
  const listing = res.body as unknown as TestListing;
  await query(`UPDATE listings SET status = 'active' WHERE id = $1`, [listing.id]);
  listing.status = 'active';
  return listing;
};

export const registerVerifiedUser = async (input: {
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
  const verified = await postJson('/api/auth/register/verify', {
    email: input.email,
    otp,
  });
  assert.equal(verified.response.status, 201);
  return verified.body.user;
};
