import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import dreamRoutes from './modules/dream/dream.route';
import taskRoutes from './modules/task/task.route';
import notificationRoutes from './modules/notification/notification.route';
import userRoutes from './modules/user/user.route';
import cors from 'cors';
export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestLogger);
  const allowedOrigins = [
    'http://localhost:8080',
    'https://your-frontend-domain.com'
  ];



  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dreams', dreamRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);

  // Global error handler
  app.use(errorHandler);

  return app;
}
