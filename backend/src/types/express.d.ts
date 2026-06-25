import type { User } from './domain';

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'passwordHash'>;
      csrfToken?: string;
      sessionId?: string;
    }
  }
}
