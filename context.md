# Project Context — BidForGood (ICT2216 Group 2)

## Project Overview
A charity auction web application where bidders can bid on donated items to support verified charity organisations. Built with React (Vite) frontend, Express/TypeScript backend, PostgreSQL database, Socket.io for real-time bidding.

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Express + TypeScript + ts-node-dev
- **Database:** PostgreSQL (Docker container via `backend/db/compose.yaml`)
- **Real-time:** Socket.io
- **Auth:** Session-based with CSRF tokens, argon2id password hashing
- **Monorepo:** npm workspaces (root `package.json`)

## Demo Accounts
All use password: `S3cure!Pass2026`
| Email | Role | Notes |
|---|---|---|
| admin@bidforgood.test | admin | Full access |
| charity@bidforgood.test | charity | Owns "Children's Hospital Trust" (approved) |
| charity2@bidforgood.test | charity | Owns "Green Paws Animal Rescue" (pending) |
| donor@bidforgood.test | donor | Can create listings |
| bidder@bidforgood.test | bidder | Can place bids |
| bidder2@bidforgood.test | bidder | Second bidder for testing |

## Running the Project
```bash
# DB (Docker)
cd backend/db && docker compose up -d

# Backend
cd backend && npm run dev        # runs on :5000

# Frontend
cd frontend && npm run dev       # runs on :5173

# Apply DB schema changes
cd backend && npm run migrate

# Restore demo data (after test runs wipe DB)
cd backend && npm run seed
```

> **Warning:** Running `npm test` in the backend truncates ALL tables. Run `npm run seed` after.

## Database Schema — Key Tables
- `users` — all user accounts; `roles[]`, `charity_id` (FK for staff), `last_login_at`, `contact_number`
- `charities` — charity org registrations; `owner_user_id`, `status` (pending/approved/rejected)
- `campaigns` — fundraising campaigns; `charity_id`, `image_data BYTEA`, `image_mime`, `status` (active/closed)
- `listings` — auction items; `campaign_id`, `status` (draft/pending/active/sold/expired/cancelled/rejected)
- `bids` — bid history
- `sessions` — active sessions
- `audit_events` — tamper-evident log with SHA-256 hash chaining

## Implemented Features (FRs)

### FR03 — Profile Management (PR #12, merged)
- Users can update username, full name, contact number
- Password change with strength validation
- **File:** `backend/src/services/profile.service.ts`

### FR05 — Charity Staff Management (PR #14, merged)
- Approved charity orgs can create, edit, deactivate staff accounts
- Staff linked to charity via `users.charity_id`
- **Backend:** `backend/src/services/charityStaff.service.ts`
- **Frontend:** `frontend/src/pages/CharityStaffManagementPage.tsx`
- **Routes:** `GET/POST /api/charities/staff`, `PUT/PATCH /api/charities/staff/:uuid`

### FR06 — Campaign Management (PR #20, merged)
- Approved charity orgs/staff can create, edit, close campaigns
- Images stored as BYTEA blobs in `campaigns.image_data`
- Image served via `GET /api/charities/campaigns/:uuid/image`
- **Backend:** `backend/src/services/campaign.service.ts`
- **Frontend:** `frontend/src/pages/CampaignManagementPage.tsx`
- **Routes:** `GET/POST /api/charities/campaigns`, `PUT/PATCH /api/charities/campaigns/:uuid`

### FR08 — Donor Listing Creation (PR #21, merged)
- Donors create auction listings linked to active campaigns
- Listings default to `pending` status; admin approves to `active`
- **Backend:** `backend/src/services/listing.service.ts`
- **Frontend:** `frontend/src/pages/CreateListingPage.tsx`
- **Admin approval:** `POST /api/listings/:uuid/approve` (backend done, admin UI is "Coming soon")

### FR11 — Real-time Bidding (PR #23, open — pending review)
- Socket.io integration on AuctionDetailPage
- Countdown timer turns red under 3 hours
- Username masking (frontend only for now)
- Known issues flagged by reviewer: socket fallback URL, possible double bid count increment
- **Frontend:** `frontend/src/pages/AuctionDetailPage.tsx`

### FR13 — Search & Filter Listings (PR open — feat/FR13-Listings-Filter)
- `GET /api/listings` extended with: `q`, `category`, `condition`, `price_min`, `price_max`, `campaign_id`, `end_before`, `sort`
- Only `status='active'` listings ever returned (SFR enforced at DB query level)
- SQL injection prevention via `isSafeSearchQuery()` — rejects SQL keywords and metacharacters
- Filter allowlists: `ALLOWED_SORTS`, `ALLOWED_CONDITIONS`
- **Backend:** `backend/src/services/listing.service.ts` (lines 128–170)
- **Frontend:** `frontend/src/pages/AuctionsPage.tsx`

## Security Controls Implemented (OWASP Proactive Controls 2024)

| Control | Implementation |
|---|---|
| C1 Access Control | `rbac.middleware.ts:6`, ownership checks in charityStaff/campaign services, `LOCKED_FIELDS` in listing |
| C2 Cryptography | argon2id hashing (`auth.service.ts:15`), CSRF hash comparison (`csrf.middleware.ts:10`), audit hash chaining (`postgres.repository.ts:732–735`) |
| C3 Input Validation | `sanitizeText()` + `escapeHtml()` (`security.ts:83`), `isSafeSearchQuery()` (`security.ts:60`), magic byte MIME check (`campaign.service.ts:14`) |
| C4 Security from Start | SFRs defined per FR; security middleware applied globally in `app.ts` |
| C5 Secure Defaults | Security headers middleware (`securityHeaders.middleware.ts:4–8`), listings default to `pending` |
| C6 Secure Components | argon2, express-rate-limit, eslint-plugin-security, multer |
| C7 Digital Identity | OTP registration, account lockout after 5 attempts (`auth.service.ts:16–17`), generic error messages (`auth.service.ts:21`) |
| C8 Browser Security | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (`securityHeaders.middleware.ts`) |
| C9 Logging & Monitoring | Tamper-evident audit log with hash chaining, logs auth/access-denied/business events (`postgres.repository.ts:728`) |
| C10 SSRF Prevention | No user-controlled outbound URLs; files stored as BYTEA blobs, not fetched from external URLs |

## Known Issues / TODOs
- Admin UI (`AdminPage.tsx`) is "Coming soon" — listing approval done via SQL or curl for now
- FR11 has two unresolved reviewer comments (socket URL, double bid count)
- `feat/FR13-Listings-Filter` PR had secret leak (cookies.txt committed) — history rewrite in progress via `git rebase -i`
- Username masking in FR11 is frontend-only; backend not yet implemented

## Branch Conventions
- `feat/FR<n>-<description>` — feature branches
- `bug/<description>` — bug fix branches
- PRs require minimum 1 approval before merge
- Pre-commit hook: `npx lint-staged` runs ESLint on staged `.ts/.tsx` files

## Git Notes
- Running `npm test` wipes the dev DB — always run `npm run seed` after
- `npm run migrate` re-applies `schema.sql` safely (uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`)
- Both `backend/` and `frontend/` have separate `eslint.config.js` with `tsconfigRootDir` set to prevent cross-workspace lint errors
