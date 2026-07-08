const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bidforgood',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const run = async () => {
  const seedPath = path.resolve(__dirname, '../db/init/seed.production.sql');
  const sql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log(`Production demo data seeded into database "${process.env.DB_NAME || 'bidforgood'}".`);
};

run().catch((error) => {
  console.error('Production seeding failed:', error);
  process.exit(1);
});
