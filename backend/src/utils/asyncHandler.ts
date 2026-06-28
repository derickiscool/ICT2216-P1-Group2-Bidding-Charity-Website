import type { NextFunction, Request, Response } from 'express';

export const asyncHandler = <TReq extends Request = Request>(
  fn: (req: TReq, res: Response, next: NextFunction) => Promise<void>
) => (req: Request, res: Response, next: NextFunction): void => {
  void fn(req as TReq, res, next).catch(next);
};
