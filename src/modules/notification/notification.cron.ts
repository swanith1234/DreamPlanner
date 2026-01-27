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

    await enqueueNotificationJob(notification.id, 0);
    enqueued++;
  }

  // Check Schedule Progress Prompts
  await notificationService.checkDailyProgress();

  await logger.info('cron', 'Notification cron executed', {
    scanned: dueNotifications.length,
    enqueued,
  });

  return { scanned: dueNotifications.length, enqueued };
}
