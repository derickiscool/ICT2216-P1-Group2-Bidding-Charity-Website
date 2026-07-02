import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { testConnection } from './utils/db';
import authRoutes from './routes/auth.routes';
import listingRoutes from './routes/listing.routes';
import bidRoutes from './routes/bid.routes';
import adminRoutes from './routes/admin.routes';
import charityRoutes from './routes/charity.routes';
import profileRoutes from './routes/profile.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { securityHeaders } from './middleware/securityHeaders.middleware';
import { requestLogger } from './middleware/logging.middleware';

export const createApp = () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', message: 'BidForGood API is running' }));
  app.get('/api/db-test', async (_req, res, next) => {
    try { res.json(await testConnection()); } catch (err) { next(err); }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/users', profileRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/bids', bidRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/charities', charityRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
