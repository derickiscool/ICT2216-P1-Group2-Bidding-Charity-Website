import fs from 'fs';
import path from 'path';
import morgan from 'morgan';
import type { Request, Response } from 'express';

// FSR16 / NFSR10: immutable, time-stamped log records for login attempts,
// lockouts, logouts, access denials, invalid/expired session usage, and
// abnormal input data. This is the HTTP transport-level log; the structured
// per-event audit trail (audit.service.ts) already covers the same events
// at the application layer and is the source of truth — this file gives a
// second, request-level record for traceability.
const LOG_DIR = path.resolve(__dirname, '../../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const accessLogStream = fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' });
const bidAuditLogStream = fs.createWriteStream(path.join(LOG_DIR, 'bid-audit.log'), { flags: 'a' });

morgan.token('user', (req: Request) => req.user?.uuid ?? 'anonymous');
morgan.token('role', (req: Request) => req.user?.roles?.join('+') ?? '-');

morgan.token('event', (req: Request, res: Response) => {
  const status = res.statusCode;
  const url = req.path;

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
