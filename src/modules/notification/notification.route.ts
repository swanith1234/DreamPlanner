// src/modules/notification/notification.route.ts
import { Router, Request, Response, NextFunction } from 'express';
import { notificationController } from './notification.controller';
import { authMiddleware } from '../../middleware/auth';
import { runNotificationCron } from './notification.cron';
const router = Router();
// router.use(authMiddleware);

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  notificationController.list(req, res).catch(next);
});
router.post('/internal/cron/notifications', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // TODO: Implement notification cron functionality
  const result = runNotificationCron();
  res.json(result);
});


export default router;