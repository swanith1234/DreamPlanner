import { env } from './config/env';
import prisma, { resolvedDatabaseUrl } from './config/database';
import { probeConnectionVariants } from './config/dbDiagnostics';
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
    console.error('Failed to start server:', error.message);

    // The primary connection failed. Before exiting, find out WHICH connection
    // forms do work from inside this container — otherwise every hypothesis
    // costs a full deploy to test. Never allowed to mask the original failure.
    if (/TLS|OpenSSL|connect|database/i.test(String(error?.message ?? ''))) {
      await probeConnectionVariants(resolvedDatabaseUrl).catch((probeErr: any) => {
        console.error('[db-probe] probe itself failed:', probeErr?.message);
      });
    }

    await logger.error('server', 'Failed to start server', {
      error: error.message,
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await logger.info('server', 'SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

start().catch(async (error) => {
  console.error('Unhandled error during startup:', error.message);
  process.exit(1);
});