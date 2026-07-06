import type { Request } from 'express';
import { appendAuditEvent, listAuditEvents } from '../repositories';
import type { AuditEvent } from '../types/domain';
import { query } from '../utils/db';
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

export const getAdminStats = async (): Promise<AdminStats> => {
  const [userCount, listingCount, bidCount, pendingCharityCount, pendingListingCount] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM users').then(r => r.rows[0]?.count ?? 0),
    query('SELECT COUNT(*)::int AS count FROM listings').then(r => r.rows[0]?.count ?? 0),
    query('SELECT COUNT(*)::int AS count FROM bids').then(r => r.rows[0]?.count ?? 0),
    query("SELECT COUNT(*)::int AS count FROM charities WHERE status = 'pending'").then(r => r.rows[0]?.count ?? 0),
    query("SELECT COUNT(*)::int AS count FROM listings WHERE status = 'pending'").then(r => r.rows[0]?.count ?? 0),
  ]);
  return {
    totalUsers: Number(userCount),
    totalListings: Number(listingCount),
    totalBids: Number(bidCount),
    pendingCharities: Number(pendingCharityCount),
    pendingListings: Number(pendingListingCount),
  };
};

export interface AdminStats {
  totalUsers: number;
  totalListings: number;
  totalBids: number;
  pendingCharities: number;
  pendingListings: number;
}
