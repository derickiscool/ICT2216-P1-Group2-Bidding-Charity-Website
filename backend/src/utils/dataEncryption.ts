import crypto from 'crypto';

const BUFFER_MAGIC = Buffer.from('BFGENC1');
const TEXT_PREFIX = 'bfgenc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const getEncryptionKey = (): Buffer => {
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('DATA_ENCRYPTION_KEY must be configured to encrypt uploaded file data.');
  }

  const trimmed = configured.trim();
  const candidates: Buffer[] = [];
  if (/^[0-9a-f]{64}$/i.test(trimmed)) candidates.push(Buffer.from(trimmed, 'hex'));
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) candidates.push(Buffer.from(trimmed, 'base64'));
  candidates.push(Buffer.from(trimmed, 'utf8'));

  const key = candidates.find(candidate => candidate.length === KEY_BYTES);
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.');
  }
  return key;
};

export const isEncryptedBuffer = (value: Buffer): boolean =>
  value.length > BUFFER_MAGIC.length && value.subarray(0, BUFFER_MAGIC.length).equals(BUFFER_MAGIC);

export const encryptBuffer = (plain: Buffer): Buffer => {
  if (isEncryptedBuffer(plain)) return plain;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BUFFER_MAGIC, iv, tag, ciphertext]);
};

export const decryptBuffer = (stored: Buffer): Buffer => {
  if (!isEncryptedBuffer(stored)) return stored;
  const ivStart = BUFFER_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const iv = stored.subarray(ivStart, tagStart);
  const tag = stored.subarray(tagStart, ciphertextStart);
  const ciphertext = stored.subarray(ciphertextStart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

export const isEncryptedText = (value: string): boolean => value.startsWith(TEXT_PREFIX);

export const encryptText = (plain: string): string => {
  if (isEncryptedText(plain)) return plain;
  return `${TEXT_PREFIX}${encryptBuffer(Buffer.from(plain, 'utf8')).toString('base64')}`;
};

export const decryptText = (stored: string): string => {
  if (!isEncryptedText(stored)) return stored;
  return decryptBuffer(Buffer.from(stored.slice(TEXT_PREFIX.length), 'base64')).toString('utf8');
};
