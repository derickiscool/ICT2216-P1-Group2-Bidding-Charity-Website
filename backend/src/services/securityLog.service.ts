import fs from 'node:fs/promises';
import path from 'node:path';

export interface SecurityLogEvent {
  type: string;
  timestamp?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  code?: string;
  actorUserId?: number;
  message?: string;
  stack?: string;
  details?: Record<string, unknown>;
}

const logFilePath = (): string =>
  process.env.SECURITY_LOG_FILE
    ? path.resolve(process.env.SECURITY_LOG_FILE)
    : path.resolve(__dirname, '../../logs/security-events.jsonl');

export const writeSecurityLog = async (event: SecurityLogEvent): Promise<void> => {
  const target = logFilePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, 'utf8');
};
