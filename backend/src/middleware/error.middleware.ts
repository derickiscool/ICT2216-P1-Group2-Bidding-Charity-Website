import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';
import { audit } from '../services/audit.service';

export const notFoundHandler = (req: import('express').Request, res: import('express').Response): void => {
  res.status(404).json({ message: 'Not found', path: req.path });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode === 400) {
      void audit(req, 'INPUT_REJECTED', { path: req.originalUrl, code: err.code, message: err.message });
    }
    res.status(err.statusCode).json({ message: err.message, code: err.code, errors: err.details });
    return;
  }
  if (err instanceof MulterError) {
    res.status(400).json({ message: err.message, code: err.code });
    return;
  }
  console.error('[UnhandledError]', err);
  res.status(500).json({ message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
};
