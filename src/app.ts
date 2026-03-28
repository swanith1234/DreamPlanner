import express, { Express } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import dreamRoutes from './modules/dream/dream.route';
import taskRoutes from './modules/task/task.route';
import notificationRoutes from './modules/notification/notification.route';
import userRoutes from './modules/user/user.route';
import analyticsRoutes from './modules/analytics/analytics.route';
import chatRoutes from './modules/chat/chat.route';
import roadmapRoutes from './modules/roadmap/roadmap.route';
import assessmentRoutes from './modules/assessment/assessment.route';
import forecastRoutes from './modules/forecast/forecast.route';
import cors from 'cors';
import cookieParser from 'cookie-parser';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestLogger);
  // Read comma-separated allowed origins from env (set this in Render dashboard)
  // e.g. ALLOWED_ORIGINS=https://dream-planner-frontend.vercel.app,https://dreamplanner.vercel.app
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  const allowedOrigins = [
    ...envOrigins,
    // Hardcoded fallbacks (keep updated with your real Vercel URLs)
    'https://dream-planner-frontend.vercel.app',
    'https://dream-planner-one.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, mobile apps, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`[CORS] Blocked origin: ${origin}`);
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
      },
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
  app.use('/api/chat', chatRoutes);
  app.use('/api/roadmaps', roadmapRoutes);
  app.use('/api/assessments', assessmentRoutes);
  app.use('/api/forecast', forecastRoutes);

  // Global error handler
  app.use(errorHandler);

  return app;
}
