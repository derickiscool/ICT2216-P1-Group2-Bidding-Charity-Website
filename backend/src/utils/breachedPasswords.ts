import fs from 'fs';
import path from 'path';
import { sha256 } from './security';

const BUILT_IN_BREACHED = new Set([
  'password', 'password1', 'password12', 'password123', 'password123!', 'qwerty', 'qwerty123',
  'qwerty123!', '123456', '12345678', '123456789', 'letmein', 'welcome', 'welcome123',
  'admin', 'admin123', 'admin123!', 'bidforgood', 'bidforgood123', 'bidforgood123!',
  'charity123', 'iloveyou', 'monkey', 'abc123', 'passw0rd', 'p@ssw0rd', 'password!'
]);

let externalHashes: Set<string> | null = null;

function loadExternalHashes(): Set<string> {
  if (externalHashes) return externalHashes;
  externalHashes = new Set();
  const filePath = path.resolve(__dirname, '../../data/breached-password-sha256.txt');
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(trimmed)) externalHashes.add(trimmed);
    }
  }
  return externalHashes;
}

export const isBreachedPassword = (password: string): boolean => {
  const normalized = password.trim().toLowerCase();
  return BUILT_IN_BREACHED.has(normalized) || loadExternalHashes().has(sha256(normalized));
};

export const isStrongPassword = (password: string): boolean => {
  if (password.length < 8 || password.length > 128) return false;
  return !isBreachedPassword(password);
};
