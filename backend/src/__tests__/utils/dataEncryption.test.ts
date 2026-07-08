import {
  decryptBuffer,
  decryptText,
  encryptBuffer,
  encryptText,
  isEncryptedBuffer,
  isEncryptedText,
} from '../../utils/dataEncryption';

describe('data encryption utilities', () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  });

  test('encrypts and decrypts uploaded binary data with AES-GCM envelope', () => {
    const plain = Buffer.from('fake uploaded image bytes');
    const encrypted = encryptBuffer(plain);

    expect(isEncryptedBuffer(encrypted)).toBe(true);
    expect(encrypted.equals(plain)).toBe(false);
    expect(decryptBuffer(encrypted).equals(plain)).toBe(true);
  });

  test('encrypts and decrypts listing image data URLs stored as text', () => {
    const plain = 'data:image/png;base64,aW1hZ2UtYnl0ZXM=';
    const encrypted = encryptText(plain);

    expect(isEncryptedText(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plain);
    expect(decryptText(encrypted)).toBe(plain);
  });

  test('keeps legacy unencrypted values readable', () => {
    const legacyBuffer = Buffer.from('legacy bytes');
    const legacyText = 'data:image/jpeg;base64,bGVnYWN5';

    expect(decryptBuffer(legacyBuffer).equals(legacyBuffer)).toBe(true);
    expect(decryptText(legacyText)).toBe(legacyText);
  });
});
