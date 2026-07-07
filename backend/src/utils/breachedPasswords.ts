import fs from 'fs';
import path from 'path';
import { sha256 } from './security';

const BUILT_IN_BREACHED = new Set([
  'password', 'password1', 'password12', 'password123', 'password123!', 'qwerty', 'qwerty123',
  'qwerty123!', '123456', '12345678', '123456789', 'letmein', 'welcome', 'welcome123',
  'admin', 'admin123', 'admin123!', 'bidforgood', 'bidforgood123', 'bidforgood123!',
  'charity123', 'iloveyou', 'monkey', 'abc123', 'passw0rd', 'p@ssw0rd', 'password!'
]);

const BUILT_IN_DICTIONARY_WORDS = new Set([
  'administrator', 'auction', 'baseball', 'bidder', 'charity', 'computer', 'donation',
  'dragon', 'football', 'letmein', 'monkey', 'password', 'princess', 'qwerty',
  'singapore', 'student', 'sunshine', 'welcome'
]);

let externalBreachedPasswords: Set<string> | null = null;
let externalBreachedPasswordHashes: Set<string> | null = null;
let externalDictionaryWords: Set<string> | null = null;

const loadLineSet = (fileName: string, normalise: (line: string) => string): Set<string> => {
  const values = new Set<string>();
  const filePath = path.resolve(__dirname, '../../data', fileName);
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const value = normalise(trimmed);
    if (value) values.add(value);
  }
  return values;
};

function loadExternalBreachedPasswords(): Set<string> {
  if (externalBreachedPasswords) return externalBreachedPasswords;
  externalBreachedPasswords = loadLineSet('breached-passwords.txt', line => line.toLowerCase());
  return externalBreachedPasswords;
}

function loadExternalBreachedPasswordHashes(): Set<string> {
  if (externalBreachedPasswordHashes) return externalBreachedPasswordHashes;
  externalBreachedPasswordHashes = loadLineSet('breached-password-sha256.txt', line => line.toLowerCase());
  return externalBreachedPasswordHashes;
}

function loadExternalDictionaryWords(): Set<string> {
  if (externalDictionaryWords) return externalDictionaryWords;
  externalDictionaryWords = loadLineSet('dictionary-words.txt', normaliseDictionaryWord);
  return externalDictionaryWords;
}

const normaliseDictionaryWord = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');

const dictionaryWords = (): Set<string> =>
  new Set([...BUILT_IN_DICTIONARY_WORDS, ...loadExternalDictionaryWords()]);

export const isBreachedPassword = (password: string): boolean => {
  const normalized = password.trim().toLowerCase();
  return (
    BUILT_IN_BREACHED.has(normalized) ||
    loadExternalBreachedPasswords().has(normalized) ||
    loadExternalBreachedPasswordHashes().has(sha256(password))
  );
};

export const isDictionaryPassword = (password: string): boolean => {
  const lettersOnly = password.trim().toLowerCase().replace(/[^a-z]/g, '');
  const normalisedWord = normaliseDictionaryWord(password);
  if (!lettersOnly && !normalisedWord) return false;
  const words = dictionaryWords();
  return words.has(lettersOnly) || words.has(normalisedWord);
};

export const isStrongPassword = (password: string): boolean => {
  if (password.length < 8 || password.length > 128) return false;
  return !isBreachedPassword(password) && !isDictionaryPassword(password);
};
