import { env } from './config/env';
import prisma from './config/database';
import { logger } from './utils/logger';
import { createApp } from './app';
import { eventWorker } from './modules/event/event.worker';
import { initializeNotificationQueue, closeNotificationQueue } from './modules/notification/queue';
import { notificationQueueWorker } from './modules/notification/queue-worker';
import { emailProvider } from './modules/notification/providers/email.provider';
import { disconnectRedis } from './config/queue';
import { notificationWS } from './modules/notification/websocket.server';

const app = createApp();

async function start() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    await logger.info('server', 'Database connected');

    // Initialize email provider
    await emailProvider.initialize();
    await logger.info('server', 'Email provider initialized');

    // Initialize BullMQ notification queue
    await initializeNotificationQueue();
    await logger.info('server', 'Notification queue initialized');

    // Start notification queue worker
    await notificationQueueWorker.start();
    await logger.info('server', 'Notification queue worker started');

    // Start event worker (domain events)
    await eventWorker.start();
    await logger.info('server', 'Event worker started');

    // Start HTTP server
    const server = app.listen(env.server.port, () => {
      console.log(`🚀 Server running on http://localhost:${env.server.port}`);
      console.log(`📊 Database: Connected`);
      console.log(`🔔 BullMQ: Running (Queue-based notifications)`);
      console.log(`⚡ Event Worker: Running (Domain events)`);
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
  await logger.info('server', 'SIGTERM received, shutting down gracefully');

  // Stop workers
  await eventWorker.stop();
  await notificationQueueWorker.stop();

  // Close queue and Redis
  await closeNotificationQueue();
  await disconnectRedis();

  // Disconnect database
  await prisma.$disconnect();

  process.exit(0);
});

process.on('SIGINT', async () => {
  await logger.info('server', 'SIGINT received, shutting down gracefully');

  // Stop workers
  await eventWorker.stop();
  await notificationQueueWorker.stop();

  // Close queue and Redis
  await closeNotificationQueue();
  await disconnectRedis();

  // Disconnect database
  await prisma.$disconnect();

  process.exit(0);
});

start().catch(async (error) => {
  await logger.error('server', 'Unhandled error during startup', { error: error.message });
  process.exit(1);
});