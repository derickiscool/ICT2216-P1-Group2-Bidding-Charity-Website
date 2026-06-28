import fs from 'fs';
import path from 'path';

const BUILT_IN_BREACHED = new Set([
  'password', 'password1', 'password12', 'password123', 'password123!', 'qwerty', 'qwerty123',
  'qwerty123!', '123456', '12345678', '123456789', 'letmein', 'welcome', 'welcome123',
  'admin', 'admin123', 'admin123!', 'bidforgood', 'bidforgood123', 'bidforgood123!',
  'charity123', 'iloveyou', 'monkey', 'abc123', 'passw0rd', 'p@ssw0rd', 'password!'
]);

let externalBreachedPasswords: Set<string> | null = null;

function loadExternalBreachedPasswords(): Set<string> {
  if (externalBreachedPasswords) return externalBreachedPasswords;
  externalBreachedPasswords = new Set();
  const filePath = path.resolve(__dirname, '../../data/breached-passwords.txt');
  if (fs.existsSync(filePath)) {
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed && !trimmed.startsWith('#')) externalBreachedPasswords.add(trimmed);
    }
  }
  return externalBreachedPasswords;
}

export const isBreachedPassword = (password: string): boolean => {
  const normalized = password.trim().toLowerCase();
  return BUILT_IN_BREACHED.has(normalized) || loadExternalBreachedPasswords().has(normalized);
};

export const isStrongPassword = (password: string): boolean => {
  if (password.length < 8 || password.length > 128) return false;
  return !isBreachedPassword(password);
};
