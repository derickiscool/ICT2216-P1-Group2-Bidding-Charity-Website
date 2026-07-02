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
