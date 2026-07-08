const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const backupFile = process.env.BACKUP_FILE || process.argv[2];
if (!backupFile) throw new Error('Provide BACKUP_FILE or pass the dump path as the first argument.');
if (!fs.existsSync(backupFile)) throw new Error(`Backup file not found: ${backupFile}`);

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} must be configured before running a database restore.`);
}

const result = spawnSync('pg_restore', [
  '--clean',
  '--if-exists',
  '--no-owner',
  '-h', process.env.DB_HOST,
  '-p', process.env.DB_PORT || '5432',
  '-U', process.env.DB_USER,
  '-d', process.env.DB_NAME,
  backupFile,
], {
  stdio: 'inherit',
  env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD },
});

if (result.status !== 0) process.exit(result.status || 1);
console.log(`Database restored from ${backupFile}`);
