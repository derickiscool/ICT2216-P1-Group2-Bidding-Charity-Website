import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createApp } from '../../app';
import {
  resetRepositoryForTests,
} from '../../repositories/inMemory.repository';
import { readDevOtpForTest, clearDevOtpForTest } from '../../services/otpDelivery.service';

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
  user: { email: string };
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
  clearDevOtpForTest();
  await resetRepositoryForTests();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr === 'object' && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
};

export const stopServer = async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
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

export const loginAs = async (email: string, password = 'S3cure!Pass2026') => {
  const login = await postJson('/api/auth/login', { email, password });
  assert.equal(login.response.status, 200);
  assert.ok(login.setCookie);
  assert.ok(login.csrf);
  return { cookie: login.setCookie!.split(';')[0], csrf: login.csrf! };
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
