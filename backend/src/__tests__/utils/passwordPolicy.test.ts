import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { isBreachedPassword, isDictionaryPassword, isStrongPassword } from '../../utils/breachedPasswords';

describe('NFSR06 password policy', () => {
  test('rejects exact and padded standard dictionary words', () => {
    assert.equal(isDictionaryPassword('sunshine'), true);
    assert.equal(isDictionaryPassword('Sunshine2026!'), true);
    assert.equal(isStrongPassword('Sunshine2026!'), false);
  });

  test('rejects breached-password hashes and allows non-denylisted passphrases', () => {
    assert.equal(isBreachedPassword('Password123!'), true);
    assert.equal(isStrongPassword('Password123!'), false);
    assert.equal(isStrongPassword('CorrectHorseBatteryStaple2026!'), true);
  });
});
