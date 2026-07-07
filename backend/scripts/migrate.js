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
  const schemaPath = path.resolve(__dirname, '../db/init/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log(`Schema applied to database "${process.env.DB_NAME || 'bidforgood'}".`);
};

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
