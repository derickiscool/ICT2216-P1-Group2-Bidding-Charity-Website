import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';

export const notFoundHandler = (req: import('express').Request, res: import('express').Response): void => {
  res.status(404).json({ message: 'Not found', path: req.path });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message, code: err.code, errors: err.details });
    return;
  }
  if (err instanceof MulterError) {
    res.status(400).json({ message: err.message, code: err.code });
    return;
  }
  // body-parser failures (malformed JSON, oversized bodies) arrive as plain errors
  // carrying a 4xx status and a dotted `type`. Classify them as client errors so
  // routine bad requests are not logged and reported as unhandled 500s.
  const status = (err as { status?: unknown; statusCode?: unknown }).status
    ?? (err as { statusCode?: unknown }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const type = (err as { type?: unknown }).type;
    const code = typeof type === 'string' ? type.toUpperCase().replace(/\./g, '_') : 'BAD_REQUEST';
    const message = status === 413
      ? 'The request body exceeds the allowed size.'
      : 'The request body could not be processed.';
    res.status(status).json({ message, code });
    return;
  }
  console.error('[UnhandledError]', err);
  res.status(500).json({ message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' });
};
