# Ezra SFR Implementation Scope

This branch implements Ezra's assigned SFR scope on top of the merged BidForGood codebase.

| SFR / FSR | Related FR | Implemented evidence |
|---|---|---|
| SFR01 | FR01 | `backend/src/services/auth.service.ts` validates registration input, rejects breached/common passwords, suppresses duplicate-email enumeration, creates pending OTP registration, and only creates the user after OTP verification. Registration responses never return OTP or registration identifiers. |
| SFR02 | FR02 | `backend/src/services/auth.service.ts`, `backend/src/services/session.service.ts`, and `backend/src/middleware/auth.middleware.ts` implement login/logout, generic login errors, failed-login tracking, temporary lockout, cookie-only authentication, HttpOnly session cookies, and logout revocation. |
| SFR04 | FR04 | `backend/src/services/charity.service.ts` validates charity supporting documents with size checks, declared MIME checks, and magic-byte checks for PDF, PNG, and JPEG only. `backend/src/routes/charity.routes.ts` handles Multer upload errors as controlled 400 responses. |
| SFR05 | FR04 | `backend/src/services/charity.service.ts` creates charity registrations in `pending` state and only allows admin review once. Approved/rejected records cannot be reviewed again. |
| SFR08 | FR08 | `backend/src/services/listing.service.ts` locks auction configuration fields after activation, including snake_case and camelCase aliases such as `starting_price`, `startingPrice`, `end_time`, and `endTime`. |
| SFR10 | FR11 | `backend/src/services/bid.service.ts` serialises per-listing bid placement with an in-process mutex, validates active status, minimum increment, self-bidding, bidder role, CSRF, and bid-flooding limits. |
| SFR12 | FR13 | `backend/src/services/listing.service.ts` returns only active listings from public search/browse APIs so pending/rejected/restricted listings are not exposed. |
| SFR13 | FR13 | `backend/src/utils/security.ts` and `backend/src/services/listing.service.ts` reject malformed or SQL-specific search/filter syntax before listing filtering occurs. |
| FSR08 | Pipeline | `.github/workflows/ci.yml` includes a Gitleaks secret scan before build/test/audit. |

## Additional Fixes Completed

- Removed `Authorization: Bearer` fallback from backend authentication middleware.
- Removed localStorage-token authentication model from frontend flow.
- Updated frontend API client to preserve multipart `FormData` boundaries instead of forcing JSON content type.
- Added frontend OTP verification step after registration request.
- Replaced `Math.random()` OTP generation with `crypto.randomInt()`.
- Tightened OTP policy to 3-minute expiry and 3 failed attempts.
- Changed password policy to 8-128 characters plus breached/common-password rejection, without mandatory uppercase/lowercase/digit/symbol complexity.
- Added production fail-closed validation for missing or short `JWT_SECRET`.
- Fixed bid mutex cleanup logic.
- Added automated tests for registration enumeration suppression, OTP lifecycle, cookie-only auth, login lockout, charity upload handling, charity role enforcement, charity review idempotency, active listing locks, bid serialisation, bid-flood rejection, and production JWT secret validation.

Runtime note: this branch uses the current project's in-memory development repository. The same service-level validation and authorization rules can later be moved behind PostgreSQL repositories.
