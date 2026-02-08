import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/dashboard', analyticsController.getWeeklyDashboard);
router.post('/generate', analyticsController.triggerGeneration); // For testing/demo

export default router;
