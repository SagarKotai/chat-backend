import http from 'http';
import app from './app';
import { connectDB } from './config/database';
import { initCloudinary } from './config/cloudinary';
import { initSocketIO } from './sockets/socket';
import { config } from './config/env';
import { logger } from './utils/logger';

const PORT = config.port;

let httpServer: http.Server;

const bootstrap = async (): Promise<void> => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Initialise third-party SDKs
  initCloudinary();

  // 3. Create HTTP server from Express app
  httpServer = http.createServer(app);

  // 4. Attach Socket.IO
  initSocketIO(httpServer);

  // 5. Start listening
  httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${config.env})`);
  });
};

// ─── Graceful shutdown ───────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);

  // Stop accepting new connections and drain existing ones
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed — all connections drained');
      process.exit(0);
    });

    // Force exit after 10s if connections won't close
    setTimeout(() => {
      logger.warn('Forcing shutdown after 10s timeout');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled rejections to avoid silent crashes
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});

