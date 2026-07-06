# Testing

## Running Tests

```bash
# Backend tests (Jest, including Ezra SFR tests)
npm test -w backend

# Frontend tests (Vitest)
npm test -w frontend

# All tests
npm test
```

## Writing Tests

### Backend

| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| HTTP assertions | supertest |
| Config file | `backend/jest.config.ts` |
| Test location | `backend/src/__tests__/` (mirrors `src/` structure) |
| File naming | `*.test.ts` |
| Example | `backend/src/__tests__/utils/db.test.ts` |

Ezra's SFR integration tests are in `backend/src/__tests__/sfr/ezra.sfr.test.ts`.
They run through the same backend Jest command, so CI does not need a separate test runner.

### Frontend

| Property | Value |
|----------|-------|
| Framework | Vitest |
| DOM environment | happy-dom |
| Component testing | @testing-library/react |
| Config file | `frontend/vitest.config.ts` |
| Test location | `frontend/src/__tests__/` (mirrors `src/` structure) |
| File naming | `*.test.ts` or `*.test.tsx` |
| Example | `frontend/src/__tests__/store/authStore.test.ts` |

## CI

Tests run automatically on every push and pull request via GitHub Actions.
See `.github/workflows/tests.yml` for full pipeline configuration.

## Coverage

Coverage reports are generated when running locally:
```bash
npm test -w backend -- --coverage
npm test -w frontend -- --coverage
```

---

## Test Coverage by SFR

### SFR16 — Admin Session Enforcement

> The system shall provide an Admin dashboard to manage all entities, but must reject all access attempts or administrative actions from HTTP requests that lack a verified, unexpired Administrator-level session token.

**Test file:** `backend/src/__tests__/routes/admin.routes.test.ts`

```
SFR16 — Admin Session Enforcement
  ✓ rejects requests with no session cookie
  ✓ rejects requests with a tampered JWT signature
  ✓ rejects requests from a valid bidder session (role mismatch)
  ✓ allows requests from a valid admin session
  ✓ rejects requests after the absolute session lifetime is exceeded
```

| Test case | What it verifies |
|---|---|
| no session cookie | Unauthenticated requests receive 401 — the endpoint is never accessible without a session |
| tampered JWT signature | Signature verification rejects a cookie whose last 4 signature chars have been flipped — forged tokens cannot reach the admin handler |
| bidder session (role mismatch) | A valid but non-admin session receives 403 — authentication alone is not sufficient |
| valid admin session | A correctly authenticated admin session receives 200 — the happy path works |
| absolute session lifetime exceeded | When `absolute_expires_at` is wound back to the past in the DB, the same cookie now receives 401 — sliding session refresh cannot extend beyond the hard ceiling set at login |
