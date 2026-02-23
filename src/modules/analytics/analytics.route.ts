import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/dashboard', (req, res) => analyticsController.getWeeklyDashboard(req, res));
router.get('/sprints', (req, res) => analyticsController.listSprints(req, res));
router.get('/sprint/:weekStart', (req, res) => analyticsController.getSprintByWeekStart(req, res));
router.post('/generate', (req, res) => analyticsController.triggerGeneration(req, res)); // For testing/demo

export default router;
