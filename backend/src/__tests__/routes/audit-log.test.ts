import { afterAll, beforeAll, describe, test } from '@jest/globals';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, postJson } from '../helpers/setup';
import { getAuditEvents } from '../../services/audit.service';

beforeAll(startServer);
afterAll(stopServer);

describe('FSR16 — Immutable Audit Log', () => {
  test('writes AUTH_LOGIN_SUCCESS to audit_events and maintains an unbroken hash chain', async () => {
    const before = await getAuditEvents();

    const res = await postJson('/api/auth/login', {
      email: 'bidder@bidforgood.test',
      password: 'S3cure!Pass2026',
    });
    assert.equal(res.response.status, 200);

    const after = await getAuditEvents();
    const newEvents = after.slice(before.length);

    assert.ok(
      newEvents.some(e => e.action === 'AUTH_LOGIN_SUCCESS'),
      'Expected AUTH_LOGIN_SUCCESS in audit_events table',
    );

    // Every event's previousHash must equal the preceding event's currentHash
    for (let i = 1; i < after.length; i++) {
      assert.equal(
        after[i].previousHash,
        after[i - 1].currentHash,
        `Hash chain broken between event id=${after[i - 1].id} and id=${after[i].id}`,
      );
    }
  });

  test('writes a time-stamped security event to access.log on every authenticated request', async () => {
    // logs/ sits three levels above backend/src/middleware, which resolves to the project root
    const logPath = path.resolve(__dirname, '../../../../logs/access.log');
    const sizeBefore = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

    await postJson('/api/auth/login', {
      email: 'bidder@bidforgood.test',
      password: 'S3cure!Pass2026',
    });

    // Give morgan's stream write a moment to flush to disk
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(fs.existsSync(logPath), 'access.log should be created on first request');
    const appended = fs.readFileSync(logPath, 'utf8').slice(sizeBefore);
    assert.match(appended, /AUTH_LOGIN_SUCCESS/, 'Log line should contain the event tag');
    assert.match(
      appended,
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      'Log line should contain an ISO 8601 timestamp',
    );
  });
});
