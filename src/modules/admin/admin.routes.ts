import { Router } from 'express';
import { getDashboard, handleFeedbackAction, handleTelegramWebhook, postPipelineUpdate, getPipelineLogs } from './admin.controller';
import { authMiddleware } from '../../middleware/auth';
import { requireAdmin } from './admin.middleware';

const router = Router();

// Telegram Webhook (Unprotected so Telegram can reach it)
router.post('/telegram/webhook', handleTelegramWebhook);

// Protected Admin Routes
router.get('/dashboard', authMiddleware, requireAdmin, getDashboard);
router.post('/feedback/:id/action', authMiddleware, requireAdmin, handleFeedbackAction);
router.get('/feedback/:feedbackId/logs', authMiddleware, requireAdmin, getPipelineLogs);

// Pipeline Updates (Unprotected so external Code-Mind can post updates)
router.post('/pipeline/update', postPipelineUpdate);

export default router;
