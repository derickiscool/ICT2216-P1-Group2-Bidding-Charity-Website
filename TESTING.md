# Testing

## Running Tests

```bash
# From repo root — runs backend (Jest) and frontend (Vitest)
npm test

# Backend only
npm test -w backend

# Frontend only
npm test -w frontend

# Coverage reports
npm test -w backend -- --coverage
npm test -w frontend -- --coverage
```

Backend tests hit a real PostgreSQL database. The DB is wiped (`TRUNCATE … RESTART IDENTITY CASCADE`) and re-seeded before each test file, so files are fully isolated. Tests run serially (`--runInBand`) to prevent concurrent writers conflicting.

## Writing Tests

### Backend

| Property | Value |
|---|---|
| Framework | Jest + ts-jest |
| HTTP assertions | Node.js native `fetch` |
| Config file | `backend/jest.config.ts` |
| Test location | `backend/src/__tests__/` |
| File naming | `*.test.ts` |

### Frontend

| Property | Value |
|---|---|
| Framework | Vitest |
| DOM environment | happy-dom |
| Component testing | @testing-library/react |
| Config file | `frontend/vitest.config.ts` |
| Test location | `frontend/src/__tests__/` |
| File naming | `*.test.ts` / `*.test.tsx` |

## CI

Tests run automatically on every push and every PR targeting `main` via GitHub Actions (`.github/workflows/tests.yml`).

---

## Tested Requirements

---

### SFR01 — Registration & Email Verification

**Requirement:** Users shall register with a unique email and password. Passwords must pass a breached-password check. A 6-digit OTP is sent to the user's email and must be verified within the expiry window. OTP re-use and brute-forcing are rejected. Duplicate-email registrations must not leak whether the address is taken.

**Test file:** `backend/src/__tests__/routes/auth.routes.test.ts`

```
SFR01 — Registration & Email Verification
  ✓ blocks registration with breached or common passwords
  ✓ verifies OTP once, rejects reused OTP, expires old OTP, and locks after three failures
```

| Test case | What is asserted |
|---|---|
| blocks registration with breached or common passwords | 400 returned for known-weak passwords; 202 returned for both a new email and an existing email (identical envelope prevents enumeration) |
| verifies OTP once, rejects reused OTP, expires old OTP, and locks after three failures | Valid OTP → 201 and user created; reused OTP → 400; artificially expired OTP → 400; three wrong OTPs → 429 (lockout) |

---

### SFR02 — Authentication & Session Management

**Requirement:** Users shall authenticate via email and password. On success the server issues a session token as an `HttpOnly; SameSite=Strict` cookie — never in the response body. Bearer-token authentication is not accepted. Accounts lock for a cooldown period after five consecutive failed login attempts.

**Test file:** `backend/src/__tests__/routes/auth.routes.test.ts`

```
SFR02 — Authentication & Session Management
  ✓ returns HttpOnly cookie with SameSite=Strict on successful login
  ✓ rejects Authorization Bearer token when session cookie is absent
  ✓ locks account after five consecutive failed login attempts
```

| Test case | What is asserted |
|---|---|
| returns HttpOnly cookie with SameSite=Strict on successful login | Wrong password → 401; correct password → 200 with `HttpOnly` + `SameSite=Strict` on the `Set-Cookie` header; `token` must not appear in the JSON body |
| rejects Authorization Bearer token when session cookie is absent | 401 returned even when a valid token is sent in the `Authorization` header without a cookie |
| locks account after five consecutive failed login attempts | Five wrong passwords each return 401; sixth attempt (correct password) returns 429 with a lockout message |

---

### SFR04 / SFR05 — Charity Document Upload & Admin Review

**Requirement:** Only users with the `charity` role may submit a charity registration. Supporting documents must be PDF, PNG, or JPG verified by magic-byte inspection (not just extension), with a maximum size of 5 MB. Admin review is required before a charity is approved. Each charity may only be reviewed once.

**Test file:** `backend/src/__tests__/routes/charity.routes.test.ts`

```
SFR04/SFR05 — Charity Document Upload & Admin Review
  ✓ rejects unsafe or oversized documents and requires one-time admin review
```

| Test case | What is asserted |
|---|---|
| rejects unsafe or oversized documents and requires one-time admin review | `bidder` role → 403; PDF with wrong magic bytes → 400 `UNSUPPORTED_DOCUMENT`; file over 5 MB → 400 `UPLOAD_REJECTED`; valid PDF → 201 `pending`; non-admin review attempt → 403; admin approval → 200 `approved`; second review attempt → 400 `CHARITY_ALREADY_REVIEWED` |

---

### SFR08 — Active Listing Field Locking

**Requirement:** Once an auction listing becomes active, core auction configuration fields (starting price, end time) are locked and must not be modifiable by any actor, including admins. Attempts to modify locked fields must be explicitly rejected.

**Test file:** `backend/src/__tests__/routes/listing.routes.test.ts`

```
SFR08 — Active Listing Field Locking
  ✓ rejects modifications to locked fields on active auction listings
```

| Test case | What is asserted |
|---|---|
| rejects modifications to locked fields on active auction listings | A listing created with `durationHours` immediately becomes active (status `active`); a PATCH attempting to change `startingPrice` and `endTime` returns 403 with a message matching `/locked/i` |

---

### SFR10 — Bid Validation & Flood Protection

**Requirement:** Every bid request must carry a valid CSRF token. Bids below the minimum increment must be rejected. Concurrent bids for the same amount on the same listing must be serialised so that only one succeeds. Automated bid flooding (more than 10 bids in a short window) must be rate-limited.

**Test file:** `backend/src/__tests__/routes/bid.routes.test.ts`

```
SFR10 — Bid Validation & Flood Protection
  ✓ requires CSRF token, enforces minimum increment, and accepts valid sequential bids
  ✓ serialises concurrent same-listing bids and rejects automated bid flooding
```

| Test case | What is asserted |
|---|---|
| requires CSRF token, enforces minimum increment, and accepts valid sequential bids | Missing CSRF → 403; bid equal to current price (below increment) → 400; valid bid → 201; second valid bid → 201 |
| serialises concurrent same-listing bids and rejects automated bid flooding | Two concurrent identical-amount bids → one 201 and one 400 (DB row-level lock); 11th bid in rapid succession → 429 `BID_FLOOD_REJECTED` |

---

### SFR12 / SFR13 — Search & Filter Security

**Requirement:** Public listing search must only return listings with `active` status. Listings in `draft`, `pending`, `sold`, or `expired` states must be hidden. Search queries that contain SQL-injection-like patterns must be rejected.

**Test file:** `backend/src/__tests__/routes/listing.routes.test.ts`

```
SFR12/SFR13 — Search & Filter Security
  ✓ hides pending listings from public search and rejects SQL-like queries
```

| Test case | What is asserted |
|---|---|
| hides pending listings from public search and rejects SQL-like queries | `GET /api/listings` → 200; all returned listings have `status === 'active'`; no listing title contains "Pending"; query with `' OR 1=1--` → 400 `UNSAFE_SEARCH_QUERY` |

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

---

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

### NFSR04 — WORM Enforcement on Audit Log

> The audit logs shall be append-only and tamper-evident, implemented using Write-Once-Read-Many (WORM) storage, preventing any modification even by database admins.

**Test file:** `backend/src/__tests__/routes/audit-log.test.ts`

```
NFSR04 — WORM enforcement on audit_events
  ✓ UPDATE on an existing audit_events row is rejected at the database level
  ✓ DELETE of a row younger than 365 days is rejected at the database level (NFSR10)
```

| Test case | What it verifies |
|---|---|
| UPDATE blocked | A direct `UPDATE audit_events SET action = 'TAMPERED'` via the DB connection raises an exception matching `/WORM violation/i` — the trigger fires even for privileged connections |
| DELETE blocked within 365 days | A direct `DELETE FROM audit_events` on a freshly-inserted row raises an exception matching `/Retention policy violation/i` — rows cannot be purged before the compliance window elapses |

**Implementation:** Two PostgreSQL row-level triggers in `schema.sql`:
- `audit_events_no_update` — fires `BEFORE UPDATE`, always raises; implemented by `audit_events_block_update()`
- `audit_events_retention` — fires `BEFORE DELETE`, raises if `OLD.timestamp > NOW() - INTERVAL '365 days'`; implemented by `audit_events_retention_check()`

`TRUNCATE` (used only by the test-reset helper) bypasses row-level triggers by design and is not a production operation.

---

### NFSR10 — Centralized Security Event Log with 365-Day Retention

> All security-relevant events (logins, bids, payments, admin actions, role changes) shall be logged in a centralized, immutable log server, and retained for a minimum compliance period of 365 days.

**Test file:** `backend/src/__tests__/routes/audit-log.test.ts`

```
FSR16 — Immutable Audit Log
  ✓ logs security-relevant events for bids, payments, and admin actions (NFSR10)
```

| Test case | What it verifies |
|---|---|
| NFSR10 event taxonomy | `AUTH_LOGIN_SUCCESS` is present; all auth events carry a non-null timestamp; the audit table is the single centralized store |

**Covered event categories:**

| Category | Actions logged |
|---|---|
| Logins / logouts / lockouts | `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGIN_LOCKED`, `AUTH_LOGOUT` |
| Bids | `BID_ACCEPTED`, `BID_REJECTED_MIN_INCREMENT`, `AUTO_BID_CREATED`, `AUTO_BID_CANCELLED` |
| Payments | `PAYMENT_OFFER_CREATED`, `PAYMENT_OFFER_REASSIGNED`, `PAYMENT_COMPLETED`, `PAYMENT_DEADLINE_MISSED`, `PAYMENT_ACCESS_DENIED`, `ESCROW_RELEASED` |
| Admin actions | `USER_ACTIVATED`, `USER_DEACTIVATED`, `CHARITY_REVIEWED`, `LISTING_APPROVED`, `LISTING_REJECTED`, `LISTING_CHANGES_REQUESTED` |
| Role changes | `CHARITY_STAFF_CREATED`, `CHARITY_STAFF_DEACTIVATED`, `CHARITY_STAFF_REACTIVATED` |
| Session / access | `AUTH_SESSION_MISSING`, `AUTH_SESSION_INVALID`, `ACCESS_DENIED` |

**Retention:** Enforced by the `audit_events_retention` trigger (see NFSR04 above). Rows younger than 365 days cannot be deleted even by a DBA.

---

### FSR16 — Immutable Audit Log

**Requirement:** The system shall generate an immutable, time-stamped log record for:
1. All successful and failed login attempts, account lockouts, and logouts
2. Access denials, privilege escalations, and violations of server-side access control rules
3. Invalid/expired session usage and abnormal input data

**Test file:** `backend/src/__tests__/routes/audit-log.test.ts`

```
FSR16 — Immutable Audit Log
  ✓ writes AUTH_LOGIN_SUCCESS to audit_events and maintains an unbroken hash chain
  ✓ writes a time-stamped security event to access.log on every authenticated request
```

| Test case | What is asserted |
|---|---|
| writes AUTH_LOGIN_SUCCESS to audit_events and maintains an unbroken hash chain | `AUTH_LOGIN_SUCCESS` row exists in the DB after a successful login; every event's `previousHash` equals the preceding row's `currentHash` (tamper detection) |
| writes a time-stamped security event to access.log on every authenticated request | `access.log` file size grows after a request; appended bytes contain `AUTH_LOGIN_SUCCESS` and an ISO 8601 timestamp |

#### Two logging layers

**Layer 1 — Structured DB audit trail (`audit_events` table)**

Each row is linked to the previous by a SHA-256 hash chain (`previous_hash → current_hash`), making any tampering detectable. Records are append-only (no `UPDATE`/`DELETE` paths in the repository). Queryable by admins at `GET /api/admin/audit-events`.

| Action | Trigger | Source |
|---|---|---|
| `AUTH_LOGIN_SUCCESS` | Password verified, session issued | `auth.service.ts` |
| `AUTH_LOGIN_FAILED` | Wrong password or inactive account | `auth.service.ts` |
| `AUTH_LOGIN_LOCKED` | Account locked after repeated failures | `auth.service.ts` |
| `AUTH_LOGOUT` | Session revoked | `auth.service.ts` |
| `AUTH_SESSION_MISSING` | Protected route hit with no session cookie | `auth.middleware.ts` |
| `AUTH_SESSION_INVALID` | Cookie present but expired, tampered, or revoked | `auth.middleware.ts` |
| `ACCESS_DENIED` | Authenticated user lacks the required role | `rbac.middleware.ts` |
| `INPUT_REJECTED` | Any unhandled 400 AppError (catch-all) | `error.middleware.ts` |
| `AUTH_REGISTER_*` | Registration OTP flow events | `auth.service.ts` |
| `PROFILE_UPDATED` / `PASSWORD_CHANGED` | Profile edits | `profile.service.ts` |
| `BID_ACCEPTED` / `BID_REJECTED_MIN_INCREMENT` | Bid outcomes | `bid.service.ts` |
| `LISTING_CREATED` / `LISTING_UPDATED` / `LISTING_APPROVED` | Listing lifecycle | `listing.service.ts` |
| `CHARITY_REGISTER_PENDING` / `CHARITY_REVIEWED` | Charity application flow | `charity.service.ts` |

**Layer 2 — HTTP file log (`logs/access.log`)**

Written by morgan on every request. Append-only, timestamped, human-readable. Each line carries a security event tag derived from the response status and path.

| Tag | Condition |
|---|---|
| `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILED` / `AUTH_LOGIN_LOCKED` | Login endpoint by status |
| `AUTH_LOGOUT` | Logout endpoint → 2xx |
| `SESSION_INVALID_OR_EXPIRED` | Any route → 401 |
| `ACCESS_DENIED` | Any route → 403 |
| `ABNORMAL_INPUT_DATA` | Any route → 400 |
| `RATE_LIMITED` | Any route → 429 |

A dedicated `logs/bid-audit.log` additionally captures every bid/payment endpoint hit with the bid amount included.
