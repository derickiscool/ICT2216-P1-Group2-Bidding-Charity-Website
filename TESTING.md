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

### FSR-14 — Password Reset Flow

> Users can reset their forgotten password via a 6-digit OTP delivered to their registered email. Admin accounts are explicitly excluded from this self-service flow.

**Test file:** `backend/src/__tests__/routes/auth.routes.test.ts`

```
Password Reset Flow
  ✓ always returns the generic message for an unknown email (user enumeration protection)
  ✓ suppresses OTP for admin accounts — admin cannot reset password via this flow
  ✓ generates a 6-digit OTP for a valid non-admin account
  ✓ rejects reset with a wrong OTP but keeps the token for retry
  ✓ locks out after 5 consecutive wrong OTP attempts
  ✓ rejects reset with an expired OTP
  ✓ resets password successfully, old password rejected, all sessions revoked
```

| Test case | What it verifies |
|---|---|
| unknown email | Returns the same generic 200 response regardless of whether the email exists — prevents user enumeration |
| admin account suppressed | `POST /forgot-password` with an admin email returns 200 but no OTP is generated and no token is stored — admins cannot self-service reset |
| OTP generated for non-admin | A valid, active, verified non-admin account receives a 6-digit numeric OTP in the dev outbox |
| wrong OTP — token persists | An incorrect token returns 400 `RESET_OTP_INVALID` but the token remains valid so the user can retry; the correct OTP still succeeds on the next attempt |
| 5-attempt lockout | After 5 consecutive wrong OTP submissions the token is removed; the correct OTP then also fails with 400 `RESET_OTP_INVALID` |
| expired OTP | Token is backdated in the DB; the correct OTP is still rejected with 400 `RESET_OTP_INVALID` and the token is cleaned up |
| successful reset + session revocation | Valid OTP resets the password; the pre-existing session receives 401 on `/me`, old password login returns 401, new password login returns 200 |

---

### SFR14 — Digital Donation Receipt

> The application shall generate a digital donation receipt, but must strictly reject any attempts by Users to modify the amount, beneficiary, or item details after receipt generation.

**Test file:** `backend/src/__tests__/routes/payment.routes.test.ts`

```
SFR14 — Digital Donation Receipt
  ✓ receipt is automatically generated when payment is completed
  ✓ receipt captures the correct amount, item title, and beneficiary
  ✓ receipt is not accessible to a different bidder — 403
  ✓ no PUT or PATCH route exists for receipts — 404
  ✓ completing the same payment a second time is rejected — immutability guard
```

| Test case | What it verifies |
|---|---|
| auto-generation | A `receipts` row is inserted atomically inside `completePayment`; the UUID is retrievable immediately after |
| correct fields | `itemTitle` matches the listing title, `beneficiaryName` matches `charityName`, `amount` is a positive number, `generatedAt` is a timestamp |
| access control | A non-bidder (admin) session receives 403 from `requireRole('bidder')` on `GET /api/payments/receipts/:uuid` |
| no mutation endpoints | `PUT` and `PATCH` on the receipt URL return 404 — no such routes are registered |
| double-complete rejected | Calling `POST /:uuid/complete` on an already-completed payment returns 400 `PAYMENT_NOT_PENDING`, preventing a second receipt from being generated |

---

### SFR15 — Shipping Verification & Delivery Confirmation

> Upon payment confirmation from the Winning Bidder, the system shall require the Donor to provide shipping verification details before updating the listing status to "Shipped" and enabling the Bidder to confirm when they have received the item, but must sanitize the input to prevent XSS and reject any attempts to manually force the listing into a "Delivered" state.

**Test file:** `backend/src/__tests__/routes/payment.routes.test.ts`

```
SFR15 — Shipping Verification & Delivery Confirmation
  ✓ donor cannot confirm shipping when listing is not yet sold — status guard
  ✓ non-donor role cannot submit shipping details — 403
  ✓ XSS payloads in shipping fields are sanitized before storage
  ✓ valid shipping confirmation transitions listing status to shipped
  ✓ bidder cannot confirm delivery when listing is not yet shipped — forced delivery rejected
  ✓ non-winner bidder cannot confirm delivery — 403
  ✓ winning bidder confirming delivery transitions listing to delivered and releases escrow
```

| Test case | What it verifies |
|---|---|
| status guard on ship | `POST /:uuid/ship` on an active (not yet sold) listing returns 400 `INVALID_LISTING_STATUS` — shipping cannot be confirmed before payment |
| role guard on ship | A bidder session on `POST /:uuid/ship` returns 403 — only donors may confirm shipping |
| XSS sanitization | `<script>alert(1)</script>` in `trackingNumber`, `carrier`, and `notes` is HTML-escaped by `sanitizeText` before storage; the raw tag never reaches the DB |
| ship transitions status | After `POST /:uuid/ship` returns 200, the DB row shows `status = 'shipped'` |
| forced delivery rejected | `POST /:uuid/deliver` on a `sold` (not yet `shipped`) listing returns 400 `INVALID_LISTING_STATUS` — the `delivered` state cannot be reached without passing through `shipped` |
| non-winner delivery blocked | A non-bidder session (admin) on `POST /:uuid/deliver` returns 403 |
| full delivery flow | After a valid `POST /:uuid/deliver`, the listing status is `delivered` and the payment `escrow_state` is `released` |
