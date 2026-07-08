BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. USERS (16 accounts)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO users (email, username, full_name, roles, password_hash, is_verified, is_active)
SELECT * FROM (VALUES
  ('admin@bidforgood.test',       'admin',      'System Admin',       ARRAY['admin']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('donor1@bidforgood.test',      'donor1',     'Sarah Tan',          ARRAY['donor']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('donor2@bidforgood.test',      'donor2',     'Mike Chen',          ARRAY['donor']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('donor3@bidforgood.test',      'donor3',     'Priya Sharma',       ARRAY['donor']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder1@bidforgood.test',     'bidder1',    'Alex Wong',          ARRAY['bidder']::TEXT[],      '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder2@bidforgood.test',     'bidder2',    'Emily Lim',          ARRAY['bidder']::TEXT[],      '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder3@bidforgood.test',     'bidder3',    'James Lee',          ARRAY['bidder']::TEXT[],      '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder4@bidforgood.test',     'bidder4',    'Lisa Ng',            ARRAY['bidder']::TEXT[],      '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('bidder5@bidforgood.test',     'bidder5',    'David Koh',          ARRAY['bidder']::TEXT[],      '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('charity1@bidforgood.test',    'charity1',   'Childrens Hospital', ARRAY['charity']::TEXT[],     '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('charity2@bidforgood.test',    'charity2',   'Green Paws Rescue',  ARRAY['charity']::TEXT[],     '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('charity3@bidforgood.test',    'charity3',   'Food Bank SG',       ARRAY['charity']::TEXT[],     '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('charity4@bidforgood.test',    'charity4',   'Arts for Youth',     ARRAY['charity']::TEXT[],     '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('combined1@bidforgood.test',   'combined1',  'Sam Wilson',         ARRAY['bidder']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('combined2@bidforgood.test',   'combined2',  'Jamie Koh',          ARRAY['bidder']::TEXT[],       '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true),
  ('staff1@bidforgood.test',      'staff1',     'John Tan',           ARRAY['charity_staff']::TEXT[], '$argon2id$v=19$m=65536,t=3,p=1$kRmmV2/5QUV8uhubx1+3iw$ytVsA4zKMPB19uS8PHuhDxdZYNed8tZS8KU5j0wEZMc', true, true)
) AS t(email, username, full_name, roles, password_hash, is_verified, is_active)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = t.email);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. CHARITIES (4 — 3 approved, 1 pending)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO charities (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status, reviewed_by, reviewed_at)
SELECT
  (SELECT id FROM users WHERE email = 'charity1@bidforgood.test'),
  'Children''s Hospital Trust',
  'Provides medical care and family support services for children in need across Singapore.',
  'registration-cert.pdf', 'application/pdf',
  'a3f5c8d9e1b2a4f6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  'approved',
  (SELECT id FROM users WHERE email = 'admin@bidforgood.test'),
  NOW() - INTERVAL '30 days'
WHERE NOT EXISTS (SELECT 1 FROM charities WHERE organisation_name = 'Children''s Hospital Trust');

INSERT INTO charities (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status, reviewed_by, reviewed_at)
SELECT
  (SELECT id FROM users WHERE email = 'charity2@bidforgood.test'),
  'Green Paws Animal Rescue',
  'Rescues, rehabilitates, and rehomes abandoned animals. No-kill shelter charity.',
  'registration-cert.pdf', 'application/pdf',
  'b4e6d9c0f2a3b5d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1',
  'approved',
  (SELECT id FROM users WHERE email = 'admin@bidforgood.test'),
  NOW() - INTERVAL '25 days'
WHERE NOT EXISTS (SELECT 1 FROM charities WHERE organisation_name = 'Green Paws Animal Rescue');

INSERT INTO charities (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status, reviewed_by, reviewed_at)
SELECT
  (SELECT id FROM users WHERE email = 'charity3@bidforgood.test'),
  'Food Bank Singapore',
  'Fighting hunger by redistributing surplus food to communities in need.',
  'registration-cert.pdf', 'application/pdf',
  'c5f7e8d0a3b4c6d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
  'approved',
  (SELECT id FROM users WHERE email = 'admin@bidforgood.test'),
  NOW() - INTERVAL '20 days'
WHERE NOT EXISTS (SELECT 1 FROM charities WHERE organisation_name = 'Food Bank Singapore');

INSERT INTO charities (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status)
SELECT
  (SELECT id FROM users WHERE email = 'charity4@bidforgood.test'),
  'Arts for Youth',
  'Making arts education accessible to underprivileged children through workshops and programmes.',
  'registration-cert.pdf', 'application/pdf',
  'd6a8f9e1b4c5d7e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3',
  'pending'
WHERE NOT EXISTS (SELECT 1 FROM charities WHERE organisation_name = 'Arts for Youth');

-- ──────────────────────────────────────────────────────────────────────────
-- 3. CAMPAIGNS (7 — 2 per active charity + 1 for pending)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Winter Fundraising 2026', 'Annual winter fundraising drive supporting children and families.', 'active', CURRENT_DATE + 60
FROM charities c WHERE c.organisation_name = 'Children''s Hospital Trust'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Winter Fundraising 2026');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Summer Camp Appeal', 'Funds raised will send underprivileged children to summer camp.', 'closed', CURRENT_DATE - 10
FROM charities c WHERE c.organisation_name = 'Children''s Hospital Trust'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Summer Camp Appeal');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Animal Rescue Support Drive', 'Supporting rescue, rehabilitation, and rehoming for abandoned animals.', 'active', CURRENT_DATE + 45
FROM charities c WHERE c.organisation_name = 'Green Paws Animal Rescue'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Animal Rescue Support Drive');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Pet Adoption Month', 'Promoting pet adoption with reduced fees and community events.', 'active', CURRENT_DATE + 30
FROM charities c WHERE c.organisation_name = 'Green Paws Animal Rescue'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Pet Adoption Month');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Hunger Relief 2026', 'Distributing food parcels to low-income families island-wide.', 'active', CURRENT_DATE + 90
FROM charities c WHERE c.organisation_name = 'Food Bank Singapore'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Hunger Relief 2026');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Community Kitchen Fund', 'Building community kitchens in rental block estates.', 'active', CURRENT_DATE + 120
FROM charities c WHERE c.organisation_name = 'Food Bank Singapore'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Community Kitchen Fund');

INSERT INTO campaigns (charity_id, name, description, status, end_date)
SELECT c.id, 'Creative Futures', 'Art workshops and materials for underprivileged youth.', 'active', CURRENT_DATE + 50
FROM charities c WHERE c.organisation_name = 'Arts for Youth'
AND NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'Creative Futures');
-- ──────────────────────────────────────────────────────────────────────────
-- 4. LISTINGS (27 items covering every lifecycle state)
-- ──────────────────────────────────────────────────────────────────────────

-- ACTIVE — ending very soon (within 1-6 hours) — 6 items
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Signed Premier League Jersey',
       'Official match-worn jersey signed by the team. Authenticity certificate included.',
       'good', 'Sports',
       ARRAY['https://picsum.photos/seed/premier-league-jersey/800/500']::TEXT[],
       1000, 1250, 2, 'active', NOW() - INTERVAL '4 hours', NOW() + INTERVAL '3 hours',
       'Children''s Hospital Trust', 50
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Signed Premier League Jersey');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Private Dining Experience',
       'Five-course private dining session with a Michelin-trained chef in your home.',
       'new', 'Experiences',
       ARRAY['https://picsum.photos/seed/private-dining/800/500']::TEXT[],
       2000, 3800, 2, 'active', NOW() - INTERVAL '5 hours', NOW() + INTERVAL '5 hours',
       'Children''s Hospital Trust', 100
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Private Dining Experience');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Professional Photography Session',
       'Two-hour portrait or event photography session with an award-winning photographer.',
       'new', 'Experiences',
       ARRAY['https://picsum.photos/seed/photography-session/800/500']::TEXT[],
       300, 350, 1, 'active', NOW() - INTERVAL '3 hours', NOW() + INTERVAL '6 hours',
       'Green Paws Animal Rescue', 25
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Animal Rescue Support Drive'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Professional Photography Session');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Vintage Polaroid Camera',
       'Rare Polaroid OneStep 600 in working condition. Comes with 3 film packs.',
       'fair', 'Collectibles',
       ARRAY['https://picsum.photos/seed/polaroid-camera/800/500']::TEXT[],
       180, 220, 1, 'active', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours',
       'Green Paws Animal Rescue', 15
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Pet Adoption Month'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Vintage Polaroid Camera');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Limited Edition Art Print',
       'Signed and numbered print by local artist. Edition of 50. Frame included.',
       'new', 'Art',
       ARRAY['https://picsum.photos/seed/art-print/800/500']::TEXT[],
       400, 400, 0, 'active', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '4 hours',
       'Food Bank Singapore', 25
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Hunger Relief 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Limited Edition Art Print');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Designer Handbag',
       'Authentic pre-owned designer handbag in excellent condition. Dust bag included.',
       'like_new', 'Fashion',
       ARRAY['https://picsum.photos/seed/designer-handbag/800/500']::TEXT[],
       800, 950, 3, 'active', NOW() - INTERVAL '6 hours', NOW() + INTERVAL '1 hour',
       'Children''s Hospital Trust', 50
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Designer Handbag');

-- ACTIVE — ending in 1-7 days — 8 items
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Wireless Noise-Cancelling Headphones',
       'Premium over-ear headphones, brand new in sealed box from corporate sponsor.',
       'new', 'Electronics',
       ARRAY['https://picsum.photos/seed/headphones/800/500']::TEXT[],
       200, 280, 2, 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
       'Food Bank Singapore', 20
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Hunger Relief 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Wireless Noise-Cancelling Headphones');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Vintage Vinyl Record Collection',
       'Curated collection of 12 classic 70s and 80s vinyl records in mint condition.',
       'good', 'Collectibles',
       ARRAY['https://picsum.photos/seed/vinyl-records/800/500']::TEXT[],
       150, 150, 0, 'active', NOW() - INTERVAL '2 days', NOW() + INTERVAL '2 days',
       'Children''s Hospital Trust', 10
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Vintage Vinyl Record Collection');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Mechanical Keyboard',
       'Custom-built mechanical keyboard with Cherry MX switches and PBT keycaps.',
       'new', 'Electronics',
       ARRAY['https://picsum.photos/seed/mechanical-keyboard/800/500']::TEXT[],
       150, 210, 2, 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '3 days',
       'Green Paws Animal Rescue', 15
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Pet Adoption Month'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Mechanical Keyboard');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Weekend Spa Getaway Voucher',
       'Two-night stay at a luxury resort with spa treatment package. Valid for 6 months.',
       'new', 'Experiences',
       ARRAY['https://picsum.photos/seed/spa-getaway/800/500']::TEXT[],
       500, 500, 0, 'active', NOW() - INTERVAL '3 days', NOW() + INTERVAL '5 days',
       'Food Bank Singapore', 50
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Community Kitchen Fund'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Weekend Spa Getaway Voucher');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Antique Tea Set',
       'Fine bone china tea set from the 1950s. 12-piece set in original case.',
       'good', 'Collectibles',
       ARRAY['https://picsum.photos/seed/antique-tea-set/800/500']::TEXT[],
       300, 420, 4, 'active', NOW() - INTERVAL '2 days', NOW() + INTERVAL '2 days',
       'Children''s Hospital Trust', 20
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Antique Tea Set');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Smart Watch',
       'Latest generation fitness smart watch, lightly used for 2 weeks.',
       'like_new', 'Electronics',
       ARRAY['https://picsum.photos/seed/smart-watch/800/500']::TEXT[],
       350, 430, 3, 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '4 days',
       'Green Paws Animal Rescue', 20
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Animal Rescue Support Drive'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Smart Watch');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Yoga Mat Premium Set',
       'Premium non-slip yoga mat with carrying strap, blocks, and resistance bands.',
       'new', 'Sports',
       ARRAY['https://picsum.photos/seed/yoga-mat/800/500']::TEXT[],
       80, 80, 0, 'active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days',
       'Food Bank Singapore', 10
FROM users d, campaigns ca WHERE d.email = 'combined1@bidforgood.test' AND ca.name = 'Hunger Relief 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Yoga Mat Premium Set');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Board Game Collection',
       'Collection of 8 modern board games including Catan, Ticket to Ride, and Carcassonne.',
       'good', 'Hobbies',
       ARRAY['https://picsum.photos/seed/board-games/800/500']::TEXT[],
       60, 105, 2, 'active', NOW() - INTERVAL '2 days', NOW() + INTERVAL '6 days',
       'Children''s Hospital Trust', 10
FROM users d, campaigns ca WHERE d.email = 'combined2@bidforgood.test' AND ca.name = 'Summer Camp Appeal'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Board Game Collection');

-- SOLD — payment pending (2 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Antique Pocket Watch',
       'Vintage 1960s pocket watch in working condition. Gold-plated with chain.',
       'good', 'Collectibles',
       ARRAY['https://picsum.photos/seed/pocket-watch/800/500']::TEXT[],
       500, 750, 1, 'sold', NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 days',
       (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'),
       'Children''s Hospital Trust', 25
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Antique Pocket Watch');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Handcrafted Ceramic Vase',
       'Hand-thrown stoneware vase with celadon glaze. Made by local ceramic artist.',
       'new', 'Art',
       ARRAY['https://picsum.photos/seed/ceramic-vase/800/500']::TEXT[],
       200, 320, 1, 'sold', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day',
       (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'),
       'Children''s Hospital Trust', 20
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Handcrafted Ceramic Vase');

-- SOLD — paid, escrow held, awaiting shipping (2 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Leather Messenger Bag',
       'Full-grain leather messenger bag, fits 15-inch laptop. Used for 3 months.',
       'like_new', 'Fashion',
       ARRAY['https://picsum.photos/seed/messenger-bag/800/500']::TEXT[],
       250, 400, 2, 'sold', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days',
       (SELECT id FROM users WHERE email = 'bidder2@bidforgood.test'),
       'Children''s Hospital Trust', 25
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Summer Camp Appeal'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Leather Messenger Bag');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Bluetooth Speaker',
       'Portable waterproof speaker with 20-hour battery life. Barely used.',
       'good', 'Electronics',
       ARRAY['https://picsum.photos/seed/bluetooth-speaker/800/500']::TEXT[],
       100, 180, 2, 'sold', NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 days',
       (SELECT id FROM users WHERE email = 'bidder3@bidforgood.test'),
       'Green Paws Animal Rescue', 15
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Pet Adoption Month'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Bluetooth Speaker');

-- SHIPPED — awaiting delivery confirmation (2 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Gaming Console',
       'Latest model gaming console with 2 controllers and 3 games. Like new.',
       'like_new', 'Electronics',
       ARRAY['https://picsum.photos/seed/gaming-console/800/500']::TEXT[],
       500, 780, 4, 'shipped', NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days',
       (SELECT id FROM users WHERE email = 'bidder5@bidforgood.test'),
       'Food Bank Singapore', 50
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Hunger Relief 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Gaming Console');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Cookbook Collection',
       'Set of 5 award-winning cookbooks by celebrity chefs. Hardcover editions.',
       'good', 'Books',
       ARRAY['https://picsum.photos/seed/cookbooks/800/500']::TEXT[],
       50, 120, 2, 'shipped', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days',
       (SELECT id FROM users WHERE email = 'bidder4@bidforgood.test'),
       'Green Paws Animal Rescue', 10
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Animal Rescue Support Drive'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Cookbook Collection');

-- DELIVERED — fully completed loop (2 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Acoustic Guitar',
       'Solid-top acoustic guitar with hard case. Rich warm tone, ideal for intermediate players.',
       'good', 'Music',
       ARRAY['https://picsum.photos/seed/acoustic-guitar/800/500']::TEXT[],
       300, 550, 3, 'delivered', NOW() - INTERVAL '10 days', NOW() - INTERVAL '7 days',
       (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'),
       'Food Bank Singapore', 25
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Hunger Relief 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Acoustic Guitar');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, winner_id, charity_name, min_increment)
SELECT d.id, ca.id, 'Fitness Tracker',
       'Brand new fitness tracker with heart rate monitor, GPS, and sleep tracking.',
       'new', 'Electronics',
       ARRAY['https://picsum.photos/seed/fitness-tracker/800/500']::TEXT[],
       100, 200, 2, 'delivered', NOW() - INTERVAL '9 days', NOW() - INTERVAL '6 days',
       (SELECT id FROM users WHERE email = 'bidder2@bidforgood.test'),
       'Green Paws Animal Rescue', 10
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Animal Rescue Support Drive'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Fitness Tracker');

-- EXPIRED — no bids (2 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Vintage Film Camera',
       'Classic 35mm film camera in working order. Great for film photography enthusiasts.',
       'fair', 'Collectibles',
       ARRAY['https://picsum.photos/seed/film-camera/800/500']::TEXT[],
       300, 300, 0, 'expired', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days',
       'Children''s Hospital Trust', 20
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Vintage Film Camera');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Signed Novel',
       'First edition novel signed by the author. Rare collector''s item.',
       'new', 'Books',
       ARRAY['https://picsum.photos/seed/signed-novel/800/500']::TEXT[],
       200, 350, 2, 'expired', NOW() - INTERVAL '6 days', NOW() - INTERVAL '2 days',
       'Children''s Hospital Trust', 25
FROM users d, campaigns ca WHERE d.email = 'donor2@bidforgood.test' AND ca.name = 'Winter Fundraising 2026'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Signed Novel');

-- PENDING / DRAFT / CHANGES_REQUESTED (3 items)
INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment)
SELECT d.id, ca.id, 'Charity Review Painting',
       'Original acrylic painting awaiting admin and charity approval before going live.',
       'new', 'Art',
       ARRAY['https://picsum.photos/seed/review-painting/800/500']::TEXT[],
       500, 500, 0, 'pending', NOW() + INTERVAL '1 day', NOW() + INTERVAL '8 days',
       'Arts for Youth', 25
FROM users d, campaigns ca WHERE d.email = 'donor1@bidforgood.test' AND ca.name = 'Creative Futures'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Charity Review Painting');

INSERT INTO listings (donor_id, campaign_id, title, description, condition, category, images, starting_price, current_bid, bid_count, status, start_time, end_time, charity_name, min_increment, review_note, review_stage)
SELECT d.id, ca.id, 'Antique Vase',
       'Ming dynasty replica vase — admin requested description and provenance updates.',
       'good', 'Collectibles',
       ARRAY['https://picsum.photos/seed/antique-vase/800/500']::TEXT[],
       400, 400, 0, 'changes_requested', NOW() + INTERVAL '3 days', NOW() + INTERVAL '10 days',
       'Arts for Youth', 30,
       'Please provide proof of authenticity and update the description with more details.',
       'admin'
FROM users d, campaigns ca WHERE d.email = 'donor3@bidforgood.test' AND ca.name = 'Creative Futures'
AND NOT EXISTS (SELECT 1 FROM listings WHERE title = 'Antique Vase');
-- ──────────────────────────────────────────────────────────────────────────
-- 5. BIDS (40+ bids across active/sold listings)
-- ──────────────────────────────────────────────────────────────────────────

-- Signed Premier League Jersey (2 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 1100, false, NOW() - INTERVAL '3 hours'
FROM listings l, users u WHERE l.title = 'Signed Premier League Jersey' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 1100);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 1250, false, NOW() - INTERVAL '2 hours'
FROM listings l, users u WHERE l.title = 'Signed Premier League Jersey' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 1250);

-- Private Dining Experience (2 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 2800, false, NOW() - INTERVAL '4 hours'
FROM listings l, users u WHERE l.title = 'Private Dining Experience' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 2800);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 3800, false, NOW() - INTERVAL '3 hours'
FROM listings l, users u WHERE l.title = 'Private Dining Experience' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 3800);

-- Professional Photography Session (1 bid)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 350, false, NOW() - INTERVAL '2 hours'
FROM listings l, users u WHERE l.title = 'Professional Photography Session' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 350);

-- Vintage Polaroid Camera (1 bid)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 220, false, NOW() - INTERVAL '1 hour'
FROM listings l, users u WHERE l.title = 'Vintage Polaroid Camera' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 220);

-- Designer Handbag (3 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 850, false, NOW() - INTERVAL '5 hours'
FROM listings l, users u WHERE l.title = 'Designer Handbag' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 850);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 900, false, NOW() - INTERVAL '4 hours'
FROM listings l, users u WHERE l.title = 'Designer Handbag' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 900);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 950, false, NOW() - INTERVAL '3 hours'
FROM listings l, users u WHERE l.title = 'Designer Handbag' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 950);

-- Wireless Headphones (2 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 240, false, NOW() - INTERVAL '20 hours'
FROM listings l, users u WHERE l.title = 'Wireless Noise-Cancelling Headphones' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 240);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 280, false, NOW() - INTERVAL '18 hours'
FROM listings l, users u WHERE l.title = 'Wireless Noise-Cancelling Headphones' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 280);

-- Mechanical Keyboard (2 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 170, false, NOW() - INTERVAL '20 hours'
FROM listings l, users u WHERE l.title = 'Mechanical Keyboard' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 170);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 210, false, NOW() - INTERVAL '18 hours'
FROM listings l, users u WHERE l.title = 'Mechanical Keyboard' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 210);

-- Antique Tea Set (4 bids — bidder5 vs bidder3)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 320, false, NOW() - INTERVAL '36 hours'
FROM listings l, users u WHERE l.title = 'Antique Tea Set' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 320);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 360, false, NOW() - INTERVAL '30 hours'
FROM listings l, users u WHERE l.title = 'Antique Tea Set' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 360);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 400, false, NOW() - INTERVAL '24 hours'
FROM listings l, users u WHERE l.title = 'Antique Tea Set' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 400);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 420, false, NOW() - INTERVAL '20 hours'
FROM listings l, users u WHERE l.title = 'Antique Tea Set' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 420);

-- Smart Watch (3 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 370, false, NOW() - INTERVAL '22 hours'
FROM listings l, users u WHERE l.title = 'Smart Watch' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 370);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 400, false, NOW() - INTERVAL '18 hours'
FROM listings l, users u WHERE l.title = 'Smart Watch' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 400);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 430, false, NOW() - INTERVAL '16 hours'
FROM listings l, users u WHERE l.title = 'Smart Watch' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 430);

-- Board Game Collection (2 bids)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 80, false, NOW() - INTERVAL '2 days'
FROM listings l, users u WHERE l.title = 'Board Game Collection' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 80);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 105, false, NOW() - INTERVAL '1 day'
FROM listings l, users u WHERE l.title = 'Board Game Collection' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 105);

-- Sold items: bids
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 750, false, NOW() - INTERVAL '3 days'
FROM listings l, users u WHERE l.title = 'Antique Pocket Watch' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 750);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 320, false, NOW() - INTERVAL '2 days'
FROM listings l, users u WHERE l.title = 'Handcrafted Ceramic Vase' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 320);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 300, false, NOW() - INTERVAL '4 days'
FROM listings l, users u WHERE l.title = 'Leather Messenger Bag' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 300);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 400, false, NOW() - INTERVAL '3 days'
FROM listings l, users u WHERE l.title = 'Leather Messenger Bag' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 400);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 120, false, NOW() - INTERVAL '3 days'
FROM listings l, users u WHERE l.title = 'Bluetooth Speaker' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 120);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 180, false, NOW() - INTERVAL '2 days'
FROM listings l, users u WHERE l.title = 'Bluetooth Speaker' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 180);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 600, false, NOW() - INTERVAL '5 days'
FROM listings l, users u WHERE l.title = 'Gaming Console' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 600);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 700, false, NOW() - INTERVAL '4 days'
FROM listings l, users u WHERE l.title = 'Gaming Console' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 700);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 750, false, NOW() - INTERVAL '3 days'
FROM listings l, users u WHERE l.title = 'Gaming Console' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 750);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 780, false, NOW() - INTERVAL '2 days'
FROM listings l, users u WHERE l.title = 'Gaming Console' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 780);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 70, false, NOW() - INTERVAL '6 days'
FROM listings l, users u WHERE l.title = 'Cookbook Collection' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 70);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 120, false, NOW() - INTERVAL '5 days'
FROM listings l, users u WHERE l.title = 'Cookbook Collection' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 120);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder5', 350, false, NOW() - INTERVAL '8 days'
FROM listings l, users u WHERE l.title = 'Acoustic Guitar' AND u.email = 'bidder5@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 350);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder3', 450, false, NOW() - INTERVAL '7 days'
FROM listings l, users u WHERE l.title = 'Acoustic Guitar' AND u.email = 'bidder3@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 450);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 550, false, NOW() - INTERVAL '6 days'
FROM listings l, users u WHERE l.title = 'Acoustic Guitar' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 550);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder4', 130, false, NOW() - INTERVAL '7 days'
FROM listings l, users u WHERE l.title = 'Fitness Tracker' AND u.email = 'bidder4@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 130);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 200, false, NOW() - INTERVAL '6 days'
FROM listings l, users u WHERE l.title = 'Fitness Tracker' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 200);

-- Signed Novel (had 2 bids but expired)
INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder1', 250, false, NOW() - INTERVAL '5 days'
FROM listings l, users u WHERE l.title = 'Signed Novel' AND u.email = 'bidder1@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 250);

INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid, created_at)
SELECT l.id, u.id, 'bidder2', 350, false, NOW() - INTERVAL '4 days'
FROM listings l, users u WHERE l.title = 'Signed Novel' AND u.email = 'bidder2@bidforgood.test'
AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.listing_id = l.id AND b.amount = 350);
-- ──────────────────────────────────────────────────────────────────────────
-- 6. PAYMENTS (8 — covering all escrow states)
-- ──────────────────────────────────────────────────────────────────────────

-- PENDING — Antique Pocket Watch
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'), 750, 'PROD-POCKET-WATCH-001', 'not_held', 'pending',
       NOW() + INTERVAL '22 hours', NOW() - INTERVAL '2 hours'
FROM listings l WHERE l.title = 'Antique Pocket Watch'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-POCKET-WATCH-001');

-- PENDING — Ceramic Vase
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'), 320, 'PROD-CERAMIC-VASE-001', 'not_held', 'pending',
       NOW() + INTERVAL '12 hours', NOW() - INTERVAL '12 hours'
FROM listings l WHERE l.title = 'Handcrafted Ceramic Vase'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-CERAMIC-VASE-001');

-- SUCCESSFUL + HELD — Messenger Bag
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder2@bidforgood.test'), 400, 'PROD-MESSENGER-BAG-001', 'held', 'successful',
       NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'
FROM listings l WHERE l.title = 'Leather Messenger Bag'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-MESSENGER-BAG-001');

-- SUCCESSFUL + HELD — Bluetooth Speaker
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder3@bidforgood.test'), 180, 'PROD-BT-SPEAKER-001', 'held', 'successful',
       NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
FROM listings l WHERE l.title = 'Bluetooth Speaker'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-BT-SPEAKER-001');

-- SUCCESSFUL + HELD — Gaming Console (shipped)
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder5@bidforgood.test'), 780, 'PROD-GAMING-CONSOLE-001', 'held', 'successful',
       NOW() - INTERVAL '2 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'
FROM listings l WHERE l.title = 'Gaming Console'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-GAMING-CONSOLE-001');

-- SUCCESSFUL + HELD — Cookbook Collection (shipped)
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder4@bidforgood.test'), 120, 'PROD-COOKBOOKS-001', 'held', 'successful',
       NOW() - INTERVAL '3 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'
FROM listings l WHERE l.title = 'Cookbook Collection'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-COOKBOOKS-001');

-- SUCCESSFUL + RELEASED — Acoustic Guitar (fully completed)
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'), 550, 'PROD-GUITAR-001', 'released', 'successful',
       NOW() - INTERVAL '5 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days'
FROM listings l WHERE l.title = 'Acoustic Guitar'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-GUITAR-001');

-- SUCCESSFUL + RELEASED — Fitness Tracker (fully completed)
INSERT INTO payments (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
SELECT l.id, (SELECT id FROM users WHERE email = 'bidder2@bidforgood.test'), 200, 'PROD-FITNESS-001', 'released', 'successful',
       NOW() - INTERVAL '4 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'
FROM listings l WHERE l.title = 'Fitness Tracker'
AND NOT EXISTS (SELECT 1 FROM payments WHERE payment_ref = 'PROD-FITNESS-001');

-- ──────────────────────────────────────────────────────────────────────────
-- 7. DELIVERIES (4 — 2 shipped, 2 delivered)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO deliveries (listing_id, tracking_number, courier, shipped_at)
SELECT l.id, '1Z999AA10123456784', 'UPS', NOW() - INTERVAL '2 days'
FROM listings l WHERE l.title = 'Gaming Console'
AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.listing_id = l.id);

INSERT INTO deliveries (listing_id, tracking_number, courier, shipped_at)
SELECT l.id, 'EZ4000000001', 'FedEx', NOW() - INTERVAL '3 days'
FROM listings l WHERE l.title = 'Cookbook Collection'
AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.listing_id = l.id);

INSERT INTO deliveries (listing_id, tracking_number, courier, shipped_at, confirmed_at)
SELECT l.id, 'SF1234567890', 'SingPost', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'
FROM listings l WHERE l.title = 'Acoustic Guitar'
AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.listing_id = l.id);

INSERT INTO deliveries (listing_id, tracking_number, courier, shipped_at, confirmed_at)
SELECT l.id, 'DHL9876543210', 'DHL Express', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'
FROM listings l WHERE l.title = 'Fitness Tracker'
AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.listing_id = l.id);

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RECEIPTS (2 — for fully completed deliveries)
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO receipts (payment_id, listing_id, bidder_id, item_title, amount, charity_name, receipt_ref, integrity_hash, generated_at, bidder_username, payment_ref)
SELECT p.id, l.id, (SELECT id FROM users WHERE email = 'bidder1@bidforgood.test'),
       'Acoustic Guitar', 550, 'Food Bank Singapore',
       'RCP-PROD-GUITAR-001',
       encode(digest('{"receipt_ref":"RCP-PROD-GUITAR-001","amount":550}', 'sha256'), 'hex'),
       NOW() - INTERVAL '6 days', 'bidder1', 'PROD-GUITAR-001'
FROM payments p, listings l
WHERE p.payment_ref = 'PROD-GUITAR-001' AND l.title = 'Acoustic Guitar'
AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.receipt_ref = 'RCP-PROD-GUITAR-001');

INSERT INTO receipts (payment_id, listing_id, bidder_id, item_title, amount, charity_name, receipt_ref, integrity_hash, generated_at, bidder_username, payment_ref)
SELECT p.id, l.id, (SELECT id FROM users WHERE email = 'bidder2@bidforgood.test'),
       'Fitness Tracker', 200, 'Green Paws Animal Rescue',
       'RCP-PROD-FITNESS-001',
       encode(digest('{"receipt_ref":"RCP-PROD-FITNESS-001","amount":200}', 'sha256'), 'hex'),
       NOW() - INTERVAL '5 days', 'bidder2', 'PROD-FITNESS-001'
FROM payments p, listings l
WHERE p.payment_ref = 'PROD-FITNESS-001' AND l.title = 'Fitness Tracker'
AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.receipt_ref = 'RCP-PROD-FITNESS-001');

COMMIT;
