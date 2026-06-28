import type { Request, Response } from 'express';
import { getAuditEvents } from '../services/audit.service';

export const listAudit = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getAuditEvents());
};
