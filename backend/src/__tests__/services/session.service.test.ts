import { describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import { getJwtSecret } from '../../services/session.service';

describe('getJwtSecret', () => {
  test('throws when production JWT_SECRET is missing or too short', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env.JWT_SECRET = 'short';
  assert.throws(() => getJwtSecret(), /JWT_SECRET/);
  process.env.NODE_ENV = oldNodeEnv;
  if (oldSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = oldSecret;
  });
});
