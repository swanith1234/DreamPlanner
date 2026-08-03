// src/modules/notification/notification.route.ts
import { Router, Request, Response, NextFunction } from 'express';
import { notificationController } from './notification.controller';
import { pushController } from './push.controller';
import { authMiddleware } from '../../middleware/auth';
import { runNotificationCron } from './notification.cron';
import { notificationActionHandler } from './notification.action.handler';
import { testPushHandler } from './test-push.handler';

const router = Router();

// ─── Public Routes (no auth required) ────────────────────────────────────────

// External cron trigger (free third-party cron worker hits this on a timer).
// Intentionally unauthenticated — the chosen provider cannot send custom headers.
router.post('/cron/trigger', async (req, res) => {
  try {
    const result = await runNotificationCron();
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Notification action webhook — called directly by Android BroadcastReceiver.
// No JWT available in that context (no browser/cookie), so this is public.
// Security: validated by notificationId + userId existence in DB.
router.post('/action', async (req: Request, res: Response) => {
  await notificationActionHandler(req, res);
});

// ─── Protected Routes ─────────────────────────────────────────────────────────
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

router.get('/vapid-key', (req, res, next) => {
  pushController.getVapidKey(req, res).catch(next);
});

router.post('/test-direct', (req: Request, res: Response) => {
  testPushHandler(req, res);
});

export default router;