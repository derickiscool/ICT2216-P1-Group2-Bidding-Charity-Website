import type { Request, Response } from 'express';
import { confirmDelivery as confirmDeliveryService, confirmShipping as confirmShippingService } from '../services/shipping.service';

export const confirmShipping = async (req: Request, res: Response): Promise<void> => {
  res.json(await confirmShippingService(req.params.uuid, req.body as Record<string, unknown>, req));
};

export const confirmDelivery = async (req: Request, res: Response): Promise<void> => {
  res.json(await confirmDeliveryService(req.params.uuid, req));
};
