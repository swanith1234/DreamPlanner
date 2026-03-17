import prisma from '../../config/database';
import { enqueueNotificationJob } from './queue';
import { NotificationStatus } from '@prisma/client';
import { logger } from '../../utils/logger';

import { notificationService } from './notification.service';

export async function runNotificationCron() {
  const now = new Date();
  let enqueued = 0;

  const dueNotifications = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.SCHEDULED,
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 100, // batch protection
  });

  for (const notification of dueNotifications) {
    // atomic lock
    const locked = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        status: NotificationStatus.SCHEDULED,
      },
      data: {
        status: NotificationStatus.PROCESSING,
      },
    });

    if (locked.count === 0) continue;

    try {
      // ── Step 1: Attempt Queue Delivery (Scalable) ──────────────────────────
      await enqueueNotificationJob(notification.id, 0);
      enqueued++;
    } catch (queueError: any) {
      await logger.warn('cron', 'Queue failed, falling back to direct dispatch', {
        error: queueError.message,
        notificationId: notification.id
      });

      try {
        // ── Step 2: Direct Fallback (Resilient) ──────────────────────────────
        await notificationService.processNotification(notification.id);
        enqueued++;
      } catch (fallbackError: any) {
        await logger.error('cron', 'Fallback dispatch also failed. Reverting to SCHEDULED', {
          error: fallbackError.message,
          notificationId: notification.id
        });

        // ── Step 3: Safety Guard ───────────────────────────────────────────
        // Revert status so it can be picked up by the next cron run
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.SCHEDULED }
        });
      }
    }
  }

  // Check Schedule Progress Prompts
  await notificationService.checkDailyProgress();

  await logger.info('cron', 'Notification cron executed', {
    scanned: dueNotifications.length,
    enqueued,
  });

  return { scanned: dueNotifications.length, enqueued };
}
