import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { processAuctionDeadlines } from './services/payment.service';
import { purgeExpiredSessions } from './services/session.service';
import { writeSecurityLog } from './services/securityLog.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', methods: ['GET', 'POST'], credentials: true }
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('listing:join', (listingId: number) => {
    if (Number.isInteger(listingId)) void socket.join(`listing:${listingId}`);
  });
  socket.on('disconnect', () => undefined);
});


const startPaymentDeadlineWorker = () => {
  const run = async () => {
    try {
      await processAuctionDeadlines();
    } catch (error) {
      console.error('FR14 payment deadline worker failed:', error);
    }
  };

  // Run once on startup, then repeat. The interval keeps FR14 automatic without
  // requiring users/admins to click a button just to close overdue auctions.
  void run();
  const interval = setInterval(() => { void run(); }, 60_000);
  interval.unref();
};

if (process.env.NODE_ENV !== 'test') startPaymentDeadlineWorker();

const startSessionCleanupWorker = () => {
  const run = async () => {
    try {
      await purgeExpiredSessions();
    } catch (error) {
      await writeSecurityLog({
        type: 'SESSION_CLEANUP_FAILED',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }).catch(() => undefined);
    }
  };

  void run();
  const interval = setInterval(() => { void run(); }, 5 * 60_000);
  interval.unref();
};

if (process.env.NODE_ENV !== 'test') startSessionCleanupWorker();

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // NFR08: In production, this app must be deployed behind a TLS-terminating reverse
  // proxy (e.g. nginx, Caddy) for HTTPS. The `trust proxy` setting in app.ts handles
  // correct IP forwarding. All other security measures (argon2id password hashing,
  // CSRF tokens, RBAC, rate limiting, input sanitization) are built in.
  if (process.env.NODE_ENV === 'production') {
    console.log('NFR08: Production deployment — ensure HTTPS is terminated at the reverse proxy.');
  }
});
