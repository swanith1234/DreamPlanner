// src/modules/notification/notification.route.ts
import { Router, Request, Response, NextFunction } from 'express';
import { notificationController } from './notification.controller';
import { pushController } from './push.controller';
import { authMiddleware } from '../../middleware/auth';
import { runNotificationCron } from './notification.cron';
const router = Router();

// Public Webhook for External Cron (e.g. Render) to trigger every minute
router.post('/cron/trigger', async (req, res) => {
  try {
    const result = await runNotificationCron();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Protected User Routes
router.use(authMiddleware);

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  notificationController.list(req, res).catch(next);
});

router.post('/subscribe', (req, res, next) => {
  pushController.subscribe(req, res).catch(next);
});

router.post('/unsubscribe', (req, res, next) => {
  pushController.unsubscribe(req, res).catch(next);
});

router.post('/check-subscription', (req, res, next) => {
  pushController.checkSubscription(req, res).catch(next);
});

import { testPushHandler } from './test-push.handler';

// ... (other imports)

router.get('/vapid-key', (req, res, next) => {
  pushController.getVapidKey(req, res).catch(next);
});

router.post('/test-direct', (req: Request, res: Response) => {
  testPushHandler(req, res);
});

// Silent action handler for notification action buttons / inline replies
// (posted from public/sw.js and the native Android TaskActionReceiver).
router.post('/:notificationId/action', (req: Request, res: Response, next: NextFunction) => {
  notificationController.handleAction(req as any, res).catch(next);
});

export default router;