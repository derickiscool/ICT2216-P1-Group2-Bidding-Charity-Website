import crypto from 'crypto';
import validator from 'validator';

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// NFSR11: validation and low-byte sanitization are delegated to the `validator`
// library. The extra length guard preserves the previous 3-254 char contract.
export const isValidEmail = (email: string): boolean => {
  const value = email.trim();
  if (value.length < 3 || value.length > 254) return false;
  return validator.isEmail(value, { allow_utf8_local_part: false, allow_display_name: false });
};

export const safeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  // stripLow removes the same characters the previous hand-rolled regex did
  // (ASCII 0x00-0x1F and 0x7F, including newlines).
  return validator.stripLow(value.trim()).slice(0, maxLength);
};

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  const out = Object.create(null) as Record<string, string>;
  if (!header) return out;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(rawName)) continue;
    Object.defineProperty(out, rawName, {
      value: decodeURIComponent(rawValue.join('=')),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return out;
};

const SQL_META = /(\b(select|insert|update|delete|drop|alter|union|where|from|sleep|benchmark|or\s+1\s*=\s*1|and\s+1\s*=\s*1)\b)|(--|\/\*|\*\/|;|'|"|`)/i;

export const isSafeSearchQuery = (query: string): boolean => {
  const q = query.trim();
  if (q.length > 80) return false;
  if (SQL_META.test(q)) return false;
  return /^[\p{L}\p{N}\s.,&()_-]*$/u.test(q);
};

export const escapeHtml = (value: string): string => {
  let escaped = '';
  for (const char of value) {
    switch (char) {
      case '&': escaped += '&amp;'; break;
      case '<': escaped += '&lt;'; break;
      case '>': escaped += '&gt;'; break;
      case '"': escaped += '&quot;'; break;
      case "'": escaped += '&#x27;'; break;
      case '`': escaped += '&#x60;'; break;
      default: escaped += char;
    }
  }
  return escaped.trim();
};

export const sanitizeText = (value: unknown, maxLength: number): string => escapeHtml(safeString(value, maxLength));

// Mirrors the client-side check in CreateListingPage.tsx/DonorListingsPage.tsx (SFR07).
// That check alone only stops the UI form; a direct API call would still reach the
// backend, so listing text must be rejected here too, not just HTML-escaped.
// `on\w+=` is anchored to an attribute-like boundary ([\s"'</]) so it matches injected
// event handlers (e.g. ` onerror=`, `"onload=`, `<svg/onload=`) without flagging ordinary
// prose that merely contains the letters "on" mid-word — e.g. "donation = 100%" or
// "condition = new". `/` is included because HTML treats it as an attribute separator.
const SCRIPT_LIKE_PATTERN = /<\s*script|javascript:|[\s"'</]on\w+\s*=|<\s*iframe/i;

export const containsScriptLikeContent = (value: string): boolean => SCRIPT_LIKE_PATTERN.test(value);
