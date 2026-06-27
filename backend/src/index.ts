import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';

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

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
