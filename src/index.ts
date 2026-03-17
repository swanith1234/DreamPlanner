import { env } from './config/env';
import prisma from './config/database';
import { logger } from './utils/logger';
import { createApp } from './app';
import { notificationWS } from './modules/notification/websocket.server';

const app = createApp();

async function start() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    await logger.info('server', 'Database connected');

    // Start HTTP server
    const server = app.listen(env.server.port, () => {
      console.log(`🚀 Server running on http://localhost:${env.server.port}`);
      console.log(`📊 Database: Connected`);
      console.log(`📧 Email Provider: ${env.email.provider}`);
    });

    // Initialize WebSocket Server
    notificationWS.initialize(server);
    console.log(`🔌 WebSocket: Listening on /ws`);

  } catch (error: any) {
    await logger.error('server', 'Failed to start server', {
      error: error.message,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  // Disconnect database
  await prisma.$disconnect();

  process.exit(0);
});

process.on('SIGINT', async () => {
  await logger.info('server', 'SIGINT received, shutting down gracefully');

  // Disconnect database
  await prisma.$disconnect();

  process.exit(0);
});

start().catch(async (error) => {
  await logger.error('server', 'Unhandled error during startup', { error: error.message });
  process.exit(1);
});