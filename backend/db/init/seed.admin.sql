BEGIN;

-- Minimal test seed: only an admin account.
-- All other data (users, charities, listings, bids, etc.) should be
-- created through the application during systematic FR-by-FR testing.

-- Password for admin: S3cure!Pass2026
INSERT INTO users (email, username, full_name, roles, password_hash, is_verified, is_active)
SELECT 'admin@bidforgood.test', 'admin', 'Demo Admin', ARRAY['admin']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower('admin@bidforgood.test'));

COMMIT;
