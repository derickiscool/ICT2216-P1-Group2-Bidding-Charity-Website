export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string>;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: Record<string, string>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Bad request', code = 'BAD_REQUEST', details?: Record<string, string>) =>
  new AppError(400, message, code, details);
export const unauthorised = (message = 'Authentication required', code = 'AUTH_REQUIRED') =>
  new AppError(401, message, code);
export const forbidden = (message = 'Access denied', code = 'ACCESS_DENIED') =>
  new AppError(403, message, code);
export const notFound = (message = 'Not found', code = 'NOT_FOUND') =>
  new AppError(404, message, code);
export const conflict = (message = 'Conflict', code = 'CONFLICT') =>
  new AppError(409, message, code);
export const tooManyRequests = (message = 'Too many requests', code = 'RATE_LIMITED') =>
  new AppError(429, message, code);
