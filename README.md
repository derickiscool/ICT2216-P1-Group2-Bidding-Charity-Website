# BidForGood

BidForGood is a charity auction web application where users can bid on donated items, services, or experiences, with proceeds going to verified charity organisations.

This branch focuses on secure implementation scope for Deliverable 2. It builds on the merged team frontend/backend codebase and implements security controls for registration, login, charity registration, auction configuration, bidding, search filtering, CI, dependency audit, and automated tests.

## Current Implementation Scope

Implemented:

- Secure user registration with OTP email verification before account creation.
- Duplicate-email enumeration suppression during registration.
- Breached/common-password rejection using built-in strings, a breached-password denylist, and a dictionary-word list.
- Login/logout with generic failure messages, failed-login tracking, and temporary lockout backed by a persistent cache.
- Passwordless (OTP-based) login flow as an alternative to password login.
- Admin accounts require password + OTP to log in.
- Forced password change on first login for accounts issued a temporary password.
- HttpOnly cookie session management using JWT, sid, jti, sliding inactivity refresh, absolute session expiry, and server-side - session records.
- CSRF protection for all state-changing authenticated requests.
- Cookie-only authentication; Authorization: Bearer fallback is intentionally not accepted.
- Charity registration supporting-document validation for PDF, PNG, and JPEG using declared MIME type and magic-byte checks; - document stored encrypted at rest (AES-256-GCM).
- Admin-only charity registration review workflow.
- Charity staff account management (create, edit, deactivate) scoped to approved charity organisations.
- Charity campaign management (create, edit, close) with BLOB image storage encrypted at rest.
- Two-stage listing review workflow: admin approval followed by charity-staff review.
- Auction configuration locking once a listing becomes active.
- Bidder-only bid placement with CSRF, minimum increment validation, self-bidding prevention, per-listing mutex, and bid-flood protection.
- Automated bidding (auto-bid) with configurable max amount and auto-increment.
- Payment and escrow flow: deadline enforcement, payment completion, and escrow release.
- Donation receipt generation with integrity hash; bidder receipt retrieval.
- Donor shipping confirmation and bidder delivery confirmation workflow.
- Donor listing tracking dashboard.
- Public listing search/browse that only exposes active listings.
- Unsafe SQL-like search/filter syntax rejection.
- Listing filtering by category, condition, price range, campaign, and end time.
- Encryption at rest for sensitive fields: listing images, campaign images, charity documents, delivery tracking numbers, and payment amounts (AES-256-GCM).
- Profile management: username, full name, contact number updates; password change with old-password verification.
- Audit logging for security-relevant events with sensitive-field redaction and tamper-evident hash chaining.
- Structured HTTP request logging with rotating log files.
- GitHub Actions CI with dependency installation, Gitleaks secret scan, build, test, and high-severity npm audit.
- OWASP ZAP security header hardening applied and verified.
- Backend automated SFR tests covering auth, bidding, listings, payments, sessions, input validation, and error handling.

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, DaisyUI |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL via `pg` (raw SQL repository, no ORM) |
| Authentication | JWT, HttpOnly cookies, Argon2id password hashing |
| Security | CSRF token, RBAC middleware, express-rate-limit, security headers, audit logging |
| File Upload | Multer memory storage with backend validation for charity documents |
| Testing | Node built-in test runner, TypeScript checks |
| CI | GitHub Actions with Gitleaks, build, test, npm audit |

## Project Structure

```text
BidForGood/
├── .github/
│   ├── actions/
│   │   └── key-setup/
│   └── workflows/
├── .husky/
│   └── _/
├── backend/
│   ├── data/
│   ├── db/
│   │   └── init/
│   ├── scripts/
│   └── src/
│       ├── __tests__/
│       │   ├── helpers/
│       │   ├── middleware/
│       │   ├── repositories/
│       │   ├── routes/
│       │   ├── services/
│       │   └── utils/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── repositories/
│       ├── routes/
│       ├── services/
│       ├── types/
│       └── utils/
├── docs/
├── frontend/
│   └── src/
│       ├── __tests__/
│       │   ├── config/
│       │   └── store/
│       ├── components/
│       │   ├── auctions/
│       │   └── layout/
│       ├── config/
│       ├── hooks/
│       ├── pages/
│       ├── services/
│       ├── store/
│       ├── styles/
│       └── types/
└── package.json
```

## Local Setup

Install dependencies from the repository root:

```bash
npm install
```

Start PostgreSQL (Docker) and apply the schema, then copy `backend/.env.example` to `backend/.env`:

```bash
cd backend/db && cp .env.example .env && docker compose up -d && cd ../..
cp backend/.env.example backend/.env
cd backend && npm run migrate
```

This creates the schema only. To also load the [Demo Accounts](#demo-accounts) and sample listings/bids for manual testing:

```bash
npm run seed
```

Start Mailpit (Docker) to receive emails:

```bash
cd backend && docker compose -f mailpit.yaml up -d && cd ..
```

Go to `localhost:8025` to view emails.

Run both backend and frontend locally:

```bash
npm run dev
```

Default local services:

```text
Backend:  http://localhost:5000
Frontend: http://localhost:5173
```

For local OTP testing, registration OTPs are printed in the backend console. OTPs are not returned by API responses.

## Envrionment Setup For Encryption Keys

Run this command to get the encryption key:
```bash
cd backend
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Paste the generated key into backend/.env as shown below.
```env
DATA_ENCRYPTION_KEY=<your_generated_32_byte_base64_key>
```

## Validation Commands

Run these from the repository root before committing:

```bash
npm run build
npm test
npm audit --audit-level=high
```

Expected result:

```text
backend build: PASS
frontend build: PASS
backend SFR tests: PASS
frontend type-check: PASS
npm audit --audit-level=high: PASS
```

## Demo Accounts

All demo accounts use the password `S3cure!Pass2026`. Loaded automatically on first `docker compose up` (fresh volume), or on demand with `npm run seed` (from `backend/`) — see `backend/db/init/seed.sql`.

```text
donor1@bidforgood.test  (donor)
donor2@bidforgood.test  (donor)
donor3@bidforgood.test  (donor)   
bidder1@bidforgood.test (bidder)
bidder2@bidforgood.test (bidder)
bidder3@bidforgood.test (bidder)
bidder4@bidforgood.test (bidder)
bidder5@bidforgood.test (bidder)
charity1@bidforgood.test (charity) 
charity2@bidforgood.test (charity) 
charity3@bidforgood.test (charity) 
charity4@bidforgood.test (charity) 
staff1@bidforgood.test (charity_staff)
```

**Charities**

| Organisation | Status | Owner |
|---|---|---|
| Children's Hospital | approved | `charity1@bidforgood.test` |
| Green Paws Animal Rescue | approved | `charity2@bidforgood.test` |
| Food Bank SG | approved | `charity3@bidforgood.test` |
| Arts for Youth | approved | `charity4@bidforgood.test` |

**Listings** — only `active` listings appear on the public Browse Auctions page (5 of the 8 below); the rest are reachable through role-specific views (donor's own listings, admin's review queue, etc.).

| Title | Category | Status | Current Bid | Notes |
|---|---|---|---|---|
| Signed Premier League Jersey | Sports | active | $1,250 | 2 bids |
| Private Dining Experience | Experiences | active | $3,800 | 2 bids |
| Professional Photography Session | Experiences | active | $350 | 1 bid |
| Vintage Polaroid Camera | Collectibles | active | $220 | 1 bid |
| Limited Edition Art Print | Art | active | $400 | no bids yet |
| Designer Handbag | Fashion | active | $950 | 3 bids |
| Wireless Noise-Cancelling Headphones | Electronics | active | $280 | 2 bids |
| Vintage Vinyl Record Collection | Collectibles | active | $150 | no bids yet |
| Mechanical Keyboard | Electronics | active | $210 | 2 bids |
| Weekend Spa Getaway Voucher | Experiences | active | $500 | no bids yet |
| Antique Tea Set | Collectibles | active | $420 | 4 bids |
| Smart Watch | Electronics | active | $430 | 3 bids |
| Yoga Mat Premium Set | Sports | active | $80 | no bids yet |
| Board Game Collection | Hobbies | active | $105 | 2 bids |
| Antique Pocket Watch | Collectibles | sold | $750 | won by `bidder1`, payment pending |
| Handcrafted Ceramic Vase | Art | sold | $320 | won by `bidder1`, payment pending |
| Leather Messenger Bag | Fashion | sold | $400 | won by `bidder2`, paid, escrow held, awaiting shipping |
| Bluetooth Speaker | Electronics | sold | $180 | won by `bidder3`, paid, escrow held, awaiting shipping |
| Gaming Console | Electronics | shipped | $780 | won by `bidder5`, awaiting delivery confirmation |
| Cookbook Collection | Books | shipped | $120 | won by `bidder4`, awaiting delivery confirmation |
| Acoustic Guitar | Music | delivered | $550 | won by `bidder1`, completed |
| Fitness Tracker | Electronics | delivered | $200 | won by `bidder2`, completed |
| Vintage Film Camera | Collectibles | expired | $300 | no bids, auction expired |
| Signed Novel | Books | expired | $350 | 2 bids, auction expired |
| Charity Review Painting | Art | pending | $500 | awaiting admin/charity approval, hidden from Browse |
| Antique Vase | Collectibles | changes_requested | $400 | admin requested description/provenance updates |

## Security Notes

- Session tokens are sent through HttpOnly cookies and are not stored in localStorage.
- The backend intentionally rejects bearer-token authentication when no session cookie is present.
- Production must configure `JWT_SECRET` with at least 32 characters. The application fails securely if it is missing or too short in production.
- The runtime repository is PostgreSQL-backed; data persists across backend restarts.
- This branch is not publicly hosted. GitHub stores the source code only; deployment remains separate.

## License

This project is for educational purposes as part of ICT2216 Secure Software Development.
