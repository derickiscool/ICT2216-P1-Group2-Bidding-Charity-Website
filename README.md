# BidForGood

BidForGood is a charity auction web application where users can bid on donated items, services, or experiences, with proceeds going to verified charity organisations.

This branch focuses on Ezra's assigned secure implementation scope for Deliverable 2. It builds on the merged team frontend/backend codebase and implements security controls for registration, login, charity registration, auction configuration, bidding, search filtering, CI, dependency audit, and automated tests.

## Current Implementation Scope

Implemented in this branch:

- Secure user registration with OTP verification before account creation.
- Duplicate-email enumeration suppression during registration.
- Breached/common-password rejection using built-in strings and SHA-256 hash denylist.
- Login/logout with generic failure messages, failed-login tracking, and temporary lockout.
- HttpOnly cookie session management using JWT, `sid`, `jti`, expiry, and server-side session records.
- CSRF protection for state-changing authenticated requests.
- Cookie-only authentication; `Authorization: Bearer` fallback is intentionally not accepted.
- Charity registration supporting-document validation for PDF, PNG, and JPEG using declared MIME type and magic-byte checks.
- Admin-only charity registration review workflow.
- Auction configuration locking once a listing becomes active.
- Bidder-only bid placement with CSRF, minimum increment validation, self-bidding prevention, per-listing mutex, and bid-flood protection.
- Public listing search/browse that only exposes active listings.
- Unsafe SQL-like search/filter syntax rejection.
- Audit logging for security-relevant events with sensitive-field redaction.
- GitHub Actions CI with dependency installation, Gitleaks secret scan, build, test, and high-severity npm audit.
- Backend automated SFR tests.

Not implemented in this branch:

- Payment and escrow flow.
- Donation receipt generation.
- Delivery confirmation.
- Automated bidding.
- Persistent watchlist.
- Full charity campaign management.
- Full donor/bidder/charity/admin dashboards.
- Full PostgreSQL runtime repository integration.
- Docker/nginx/AWS deployment pipeline.
- OWASP ZAP/DAST execution.

## SFR Mapping

| Requirement | Status in this branch |
|---|---|
| SFR01 | Implemented: OTP registration, duplicate-email enumeration suppression, breached-password rejection. |
| SFR02 | Implemented: secure login/logout, lockout, cookie-only session authentication. |
| SFR04 | Implemented: charity supporting-document MIME and magic-byte validation. |
| SFR05 | Implemented: charity registration remains pending until admin review. |
| SFR08 | Implemented: active auction configuration fields are locked. |
| SFR10 | Implemented: bid validation, CSRF, velocity checking, and per-listing mutex. |
| SFR12 | Implemented: public search only returns active listings. |
| SFR13 | Implemented: malformed/SQL-like search syntax is rejected. |
| FSR08 | Implemented: Gitleaks secret scan in GitHub Actions. |

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, DaisyUI |
| Backend | Node.js, Express.js, TypeScript |
| Current Runtime Data Layer | In-memory repository for local development/testing |
| Intended Database | PostgreSQL / `pg` dependency present |
| Authentication | JWT, HttpOnly cookies, Argon2id password hashing |
| Security | CSRF token, RBAC middleware, express-rate-limit, security headers, audit logging |
| File Upload | Multer memory storage with backend validation for charity documents |
| Testing | Node built-in test runner, TypeScript checks |
| CI | GitHub Actions with Gitleaks, build, test, npm audit |

## Project Structure

```text
BidForGood/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── data/
│   │   └── breached-password-sha256.txt
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── tests/
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   ├── styles/
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── evidence/
│   └── implementation/
├── package.json
├── package-lock.json
└── README.md
```

## Local Setup

Install dependencies from the repository root:

```bash
npm install
```

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

```text
admin@bidforgood.test   / S3cure!Pass2026
charity@bidforgood.test / S3cure!Pass2026
donor@bidforgood.test   / S3cure!Pass2026
bidder@bidforgood.test  / S3cure!Pass2026
```

## Security Notes

- Session tokens are sent through HttpOnly cookies and are not stored in localStorage.
- The backend intentionally rejects bearer-token authentication when no session cookie is present.
- Production must configure `JWT_SECRET` with at least 32 characters. The application fails securely if it is missing or too short in production.
- The current runtime repository is in-memory and intended for local development/testing. PostgreSQL persistence remains a team task.
- This branch is not publicly hosted. GitHub stores the source code only; deployment remains separate.

## License

This project is for educational purposes as part of ICT2216 Secure Software Development.
