import crypto from 'crypto';

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isValidEmail = (email: string): boolean => {
  const value = email.trim();
  if (value.length < 3 || value.length > 254) return false;
  if ([...value].some(char => char <= ' ' || char > '~')) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at >= value.length - 1) return false;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;

  return domain.split('.').every(label => {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    return [...label].every(char =>
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9') ||
      char === '-'
    );
  });
};

export const safeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
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
