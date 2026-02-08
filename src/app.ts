import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import dreamRoutes from './modules/dream/dream.route';
import taskRoutes from './modules/task/task.route';
import notificationRoutes from './modules/notification/notification.route';
import userRoutes from './modules/user/user.route';
import analyticsRoutes from './modules/analytics/analytics.route';
import cors from 'cors';
import cookieParser from 'cookie-parser';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestLogger);
  const allowedOrigins = [
    'https://dream-planner-frontend.vercel.app',
    'https://dream-planner-one.vercel.app',
    'http://localhost:8080',
    'http://localhost:5173', // Vite local
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
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // Global error handler
  app.use(errorHandler);

  return app;
}
