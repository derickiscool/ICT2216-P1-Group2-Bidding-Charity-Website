const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} must be configured before running a database backup.`);
}

const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../backups'));
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(backupDir, `${process.env.DB_NAME}-${timestamp}.dump`);

const result = spawnSync('pg_dump', [
  '-Fc',
  '-h', process.env.DB_HOST,
  '-p', process.env.DB_PORT || '5432',
  '-U', process.env.DB_USER,
  '-d', process.env.DB_NAME,
  '-f', output,
], {
  stdio: 'inherit',
  env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD },
});

if (result.status !== 0) process.exit(result.status || 1);
console.log(`Database backup written to ${output}`);
