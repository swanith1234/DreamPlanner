import prisma from '../../config/database';
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

  const results = await Promise.allSettled(
    dueNotifications.map(async (notification) => {
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

      if (locked.count === 0) return;

      try {
        await notificationService.processNotification(notification.id);
        enqueued++;
      } catch (err: any) {
        await logger.error('cron', 'Failed to dispatch notification', {
          error: err.message,
          notificationId: notification.id
        });

        // Revert status on failure
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.SCHEDULED }
        });
      }
    })
  );

  // Check Schedule Progress Prompts
  await notificationService.checkDailyProgress();

  await logger.info('cron', 'Notification cron executed', {
    scanned: dueNotifications.length,
    processed: enqueued,
  });

  return { scanned: dueNotifications.length, processed: enqueued };
}
