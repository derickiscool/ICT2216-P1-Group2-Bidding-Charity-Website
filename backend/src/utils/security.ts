import crypto from 'crypto';

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const safeString = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
};

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    out[rawName] = decodeURIComponent(rawValue.join('='));
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

export const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

export const sanitizeText = (value: unknown, maxLength: number): string => stripHtml(safeString(value, maxLength));
