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

---

### Password Reset Flow

> Users can reset their forgotten password via a 6-digit OTP delivered to their registered email. Admin accounts are explicitly excluded from this self-service flow.

**Test file:** `backend/src/__tests__/routes/auth.routes.test.ts`

```
Password Reset Flow
  ✓ always returns the generic message for an unknown email (user enumeration protection)
  ✓ suppresses OTP for admin accounts — admin cannot reset password via this flow
  ✓ generates a 6-digit OTP for a valid non-admin account
  ✓ rejects reset with a wrong OTP
  ✓ rejects reset with an expired OTP
  ✓ resets password successfully and rejects old credentials
```

| Test case | What it verifies |
|---|---|
| unknown email | Returns the same generic 200 response regardless of whether the email exists — prevents user enumeration |
| admin account suppressed | `POST /forgot-password` with an admin email returns 200 but no OTP is generated and no token is stored — admins cannot self-service reset |
| OTP generated for non-admin | A valid, active, verified non-admin account receives a 6-digit numeric OTP in the dev outbox |
| wrong OTP | `POST /reset-password` with an incorrect token returns 400 `RESET_OTP_INVALID` and the stored token is consumed |
| expired OTP | Token is backdated in the DB; the correct OTP is still rejected with 400 `RESET_OTP_INVALID` |
| successful reset | Valid OTP resets the password; subsequent login with the old password returns 401 and with the new password returns 200 |
