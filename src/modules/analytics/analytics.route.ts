import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// Public route for external cron (e.g. Render) to trigger weekly snapshots for ALL users
router.post('/cron/weekly', (req, res) => analyticsController.runWeeklyCron(req, res));
router.post('/cron/daily', (req, res) => analyticsController.runDailyCron(req, res));

// Protected routes
router.use(authMiddleware);

router.get('/dashboard', (req, res) => analyticsController.getWeeklyDashboard(req, res));
router.get('/sprints', (req, res) => analyticsController.listSprints(req, res));
router.get('/sprint/:weekStart', (req, res) => analyticsController.getSprintByWeekStart(req, res));
router.post('/generate', (req, res) => analyticsController.triggerGeneration(req, res)); // For testing/demo

export default router;
