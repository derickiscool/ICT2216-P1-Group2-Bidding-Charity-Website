const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bidforgood',
  // TRUNCATE below is not granted to the app role — seeding requires admin.
  user: process.env.DB_ADMIN_USER || process.env.DB_USER || 'postgres',
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
});

const run = async () => {
  // Wipe all data first
  await pool.query('TRUNCATE TABLE audit_events, payments, receipts, deliveries, shipping_verifications, bids, listings, campaigns, charities, sessions, pending_registrations, auto_bids, users RESTART IDENTITY CASCADE');

  // Seed admin-only
  const seedPath = path.resolve(__dirname, '../db/init/seed.admin.sql');
  const sql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('Admin-only seed applied. All other data wiped.');
  console.log('Login: admin@bidforgood.test / S3cure!Pass2026');
};

run().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
