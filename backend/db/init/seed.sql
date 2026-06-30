BEGIN;

-- Demo accounts (see README.md "Demo Accounts"). Password for all: S3cure!Pass2026
-- Hash generated with the app's argon2id params (memoryCost=65536, timeCost=3, parallelism=1).
INSERT INTO users (email, username, full_name, roles, password_hash, is_verified, is_active)
VALUES
  ('admin@bidforgood.test', 'admin', 'Demo Admin', ARRAY['admin']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('donor@bidforgood.test', 'donor', 'Demo Donor', ARRAY['donor']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder@bidforgood.test', 'bidder', 'Demo Bidder', ARRAY['bidder']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('charity@bidforgood.test', 'charity', 'Demo Charity', ARRAY['charity']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true)
ON CONFLICT (lower(email)) DO NOTHING;

-- Demo charity organisation, already approved so bidder-facing flows have a real charity to point at.
INSERT INTO charities (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status, reviewed_by, reviewed_at)
SELECT
  (SELECT id FROM users WHERE email = 'charity@bidforgood.test'),
  'Children''s Hospital Trust',
  'Provides medical care and family support services for children in need.',
  'registration-certificate.pdf',
  'application/pdf',
  'a3f5c8d9e1b2a4f6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  'approved',
  (SELECT id FROM users WHERE email = 'admin@bidforgood.test'),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM charities WHERE organisation_name = 'Children''s Hospital Trust');

-- Demo listings covering active (with bid history), pending review, sold, and draft states.
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT (SELECT id FROM users WHERE email = 'donor@bidforgood.test'), 1, 'Signed Premier League Jersey',
       'Signed jersey donated for charity fundraising.', 'good', 'Sports', ARRAY[]::TEXT[],
       1000, 1250, 2, 'active', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 hours',
       'Children''s Hospital Trust', 50
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Signed Premier League Jersey');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT (SELECT id FROM users WHERE email = 'donor@bidforgood.test'), 1, 'Private Dining Experience',
       'Private dining session for a good cause.', 'new', 'Experiences', ARRAY[]::TEXT[],
       2000, 3800, 2, 'active', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '5 hours',
       'Food Bank Singapore', 100
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Private Dining Experience');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT (SELECT id FROM users WHERE email = 'donor@bidforgood.test'), 1, 'Pending Vintage Camera',
       'Pending approval; must not appear in public search.', 'fair', 'Collectibles', ARRAY[]::TEXT[],
       400, 400, 0, 'pending', NOW(), NOW() + INTERVAL '7 days',
       'Arts for Youth', 25
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Pending Vintage Camera');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT (SELECT id FROM users WHERE email = 'donor@bidforgood.test'), 1, 'Antique Pocket Watch',
       'Closed auction kept for testing won-item and order-history views.', 'good', 'Collectibles', ARRAY[]::TEXT[],
       500, 750, 1, 'sold', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day',
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'Children''s Hospital Trust', 25
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Antique Pocket Watch');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT (SELECT id FROM users WHERE email = 'donor@bidforgood.test'), 1, 'Weekend Spa Getaway',
       'Draft listing not yet submitted for review.', 'new', 'Experiences', ARRAY[]::TEXT[],
       1500, 1500, 0, 'draft', NOW() + INTERVAL '7 days', NOW() + INTERVAL '9 days',
       'Food Bank Singapore', 50
WHERE NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Weekend Spa Getaway');

-- Bid history backing the current_bid totals above.
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT (SELECT id FROM listings WHERE title = 'Signed Premier League Jersey'),
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'bidder', 1100, false, NOW() - INTERVAL '45 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM bids WHERE listing_id = (SELECT id FROM listings WHERE title = 'Signed Premier League Jersey') AND amount = 1100
);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT (SELECT id FROM listings WHERE title = 'Signed Premier League Jersey'),
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'bidder', 1250, false, NOW() - INTERVAL '20 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM bids WHERE listing_id = (SELECT id FROM listings WHERE title = 'Signed Premier League Jersey') AND amount = 1250
);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT (SELECT id FROM listings WHERE title = 'Private Dining Experience'),
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'bidder', 2800, false, NOW() - INTERVAL '90 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM bids WHERE listing_id = (SELECT id FROM listings WHERE title = 'Private Dining Experience') AND amount = 2800
);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT (SELECT id FROM listings WHERE title = 'Private Dining Experience'),
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'bidder', 3800, false, NOW() - INTERVAL '30 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM bids WHERE listing_id = (SELECT id FROM listings WHERE title = 'Private Dining Experience') AND amount = 3800
);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT (SELECT id FROM listings WHERE title = 'Antique Pocket Watch'),
       (SELECT id FROM users WHERE email = 'bidder@bidforgood.test'), 'bidder', 750, false, NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (
  SELECT 1 FROM bids WHERE listing_id = (SELECT id FROM listings WHERE title = 'Antique Pocket Watch') AND amount = 750
);

COMMIT;
