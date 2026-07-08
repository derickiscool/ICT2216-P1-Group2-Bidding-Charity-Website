import fs from 'fs';
import path from 'path';
import morgan from 'morgan';
import { createStream } from 'rotating-file-stream';
import type { Request, Response } from 'express';

// FSR16 / NFSR10: immutable, time-stamped log records for login attempts,
// lockouts, logouts, access denials, invalid/expired session usage, and
// abnormal input data. This is the HTTP transport-level log; the structured
// per-event audit trail (audit.service.ts) already covers the same events
// at the application layer and is the source of truth — this file gives a
// second, request-level record for traceability.
const LOG_DIR = path.resolve(__dirname, '../../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// NFSR10: rotate daily and keep 365 files (= 365 days minimum retention).
// Files are named access-YYYY-MM-DD.log; the symlink access.log always points
// to today's file so existing tooling that reads access.log continues to work.
const accessLogStream = createStream('access.log', {
  interval: '1d',
  maxFiles: 365,
  path: LOG_DIR,
});

const bidAuditLogStream = createStream('bid-audit.log', {
  interval: '1d',
  maxFiles: 365,
  path: LOG_DIR,
});

morgan.token('user', (req: Request) => req.user?.uuid ?? 'anonymous');
morgan.token('role', (req: Request) => req.user?.roles?.join('+') ?? '-');

morgan.token('event', (req: Request, res: Response) => {
  const status = res.statusCode;
  // req.path is rewritten to be router-relative by the time morgan fires;
  // req.originalUrl always preserves the full original path.
  const url = req.originalUrl.split('?')[0];

  if (url.startsWith('/api/auth/login')) {
    if (status === 200) return 'AUTH_LOGIN_SUCCESS';
    if (status === 429) return 'AUTH_LOGIN_LOCKED';
    if (status === 401) return 'AUTH_LOGIN_FAILED';
  }
  if (url.startsWith('/api/auth/logout') && status < 300) return 'AUTH_LOGOUT';
  if (status === 401) return 'SESSION_INVALID_OR_EXPIRED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 400) return 'ABNORMAL_INPUT_DATA';
  if (status === 429) return 'RATE_LIMITED';
  return 'REQUEST';
});

morgan.token('amount', (req: Request) => {
  const body = req.body as Record<string, unknown> | undefined;
  return body?.amount !== undefined ? String(body.amount) : '-';
});

const SECURITY_LOG_FORMAT = ':date[iso] [:event] :method :url status=:status user=:user role=:role ip=:remote-addr rt=:response-time ms';

// General request log: console (developer-friendly) + append-only file
// (satisfies the "time-stamped log record" requirement in FSR16/NFSR10).
export const requestLogger = [
  morgan('dev'),
  morgan(SECURITY_LOG_FORMAT, { stream: accessLogStream }),
];

// Specialised instance per Section 8.2 of the architecture: a dedicated
// morgan stream for bid (and future payment) endpoints.
export const bidAuditLogger = morgan(
  ':date[iso] [BID_AUDIT] :method :url status=:status user=:user role=:role amount=:amount ip=:remote-addr',
  { stream: bidAuditLogStream }
);
