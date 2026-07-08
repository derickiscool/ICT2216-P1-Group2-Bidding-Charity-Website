const path = require('path');
const { Pool } = require('pg');
const argon2 = require('argon2');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bidforgood',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const run = async () => {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be set to a strong temporary password before seeding admin.');
  }

  await pool.query('TRUNCATE TABLE audit_events, payments, receipts, deliveries, shipping_verifications, bids, listings, campaigns, charities, sessions, pending_registrations, auto_bids, users RESTART IDENTITY CASCADE');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  await pool.query(
    `INSERT INTO users (email, username, full_name, roles, password_hash, is_verified, is_active, must_change_password)
     VALUES ($1, $2, $3, ARRAY['admin']::TEXT[], $4, true, true, true)`,
    ['admin@bidforgood.test', 'admin', 'Demo Admin', passwordHash],
  );

  await pool.end();
  console.log('Admin-only seed applied. The seeded admin must change the temporary password on first login.');
};

run().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
