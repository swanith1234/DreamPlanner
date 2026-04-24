import { Router } from 'express';
import { getDashboard, handleFeedbackAction, handleTelegramWebhook } from './admin.controller';
import { authMiddleware } from '../../middleware/auth';
import { requireAdmin } from './admin.middleware';

const router = Router();

// Telegram Webhook (Unprotected so Telegram can reach it)
router.post('/telegram/webhook', handleTelegramWebhook);

// Protected Admin Routes
router.get('/dashboard', authMiddleware, requireAdmin, getDashboard);
router.post('/feedback/:id/action', authMiddleware, requireAdmin, handleFeedbackAction);

export default router;
