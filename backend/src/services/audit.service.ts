import type { Request } from 'express';
import { appendAuditEvent, listAuditEvents } from '../repositories/inMemory.repository';
import type { AuditEvent } from '../types/domain';
import { sha256 } from '../utils/security';

export const audit = async (
  req: Request | undefined,
  action: string,
  payload: Record<string, unknown> = {},
  resourceType?: string,
  resourceId?: string,
  actorUserId?: number
): Promise<AuditEvent> => {
  const ip = req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
  const userAgent = req?.headers?.['user-agent'] ?? 'unknown';
  return appendAuditEvent({
    actorUserId: actorUserId ?? req?.user?.id,
    action,
    resourceType,
    resourceId,
    ipHash: sha256(ip),
    userAgentHash: sha256(String(userAgent)),
    payload
  });
};

export const getAuditEvents = async (): Promise<AuditEvent[]> => listAuditEvents();
