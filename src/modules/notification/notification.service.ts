// src/modules/notification/notification.service.ts
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { notificationScheduler, ScheduledNotification } from './notification.scheduler';
import { User, Task, NotificationStatus } from '@prisma/client';


import { eventService } from '../event/event.service';

export class NotificationService {
  /**
   * Create a single notification
   */
  async createNotification(
    userId: string,
    dreamId: string | null,
    taskId: string | null,
    notification: ScheduledNotification
  ): Promise<any> {
    try {
      const created = await prisma.notification.create({
        data: {
          userId,
          dreamId,
          taskId,
          type: notification.type,
          message: notification.message,
          scheduledAt: notification.scheduledAt,
          status: NotificationStatus.SCHEDULED,
          metadata: notification.metadata,
        },
      });

      await logger.info(
        'notification',
        'Notification created (just-in-time)',
        {
          notificationId: created.id,
          taskId,
          scheduledAt: notification.scheduledAt.toISOString(),
          type: notification.type,
        },
        userId
      );

      return created;
    } catch (error: any) {
      await logger.error('notification', 'Failed to create notification', {
        error: error.message,
        taskId,
      });
      throw error;
    }
  }

  /**
   * Schedule pre-start reminders when task is created
   * Called from task.created event handler
   */
  async schedulePreStartReminders(
    userId: string,
    taskId: string,
    dreamId: string,
    startDate: Date
  ): Promise<void> {
    try {
      // Get user with preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { preferences: true },
      });

      if (!user?.preferences) {
        throw new Error('User preferences not found');
      }

      // Get pre-start reminders
      const reminders = notificationScheduler.getPreStartReminders(startDate, user);

      // Create each reminder
      for (const reminder of reminders) {
        await this.createNotification(userId, dreamId, taskId, reminder);
      }

      await logger.info(
        'notification',
        `Scheduled ${reminders.length} pre-start reminders`,
        { taskId, reminders: reminders.length },
        userId
      );
    } catch (error: any) {
      await logger.error('notification', 'Failed to schedule pre-start reminders', {
        error: error.message,
        taskId,
      });
    }
  }

  /**
   * Schedule next frequency-based reminder
   * Called by notification worker after marking notification as SENT
   */
  async scheduleNextReminder(
    userId: string,
    taskId: string,
    dreamId: string,
    deadline: Date
  ): Promise<void> {
    try {
      // Get task to verify it's still valid
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        await logger.warn('notification', 'Task not found for next reminder', { taskId }, userId);
        return;
      }

      // Check if task is still active
      if (task.status === 'COMPLETED' || task.status === 'BLOCKED') {
        await logger.info(
          'notification',
          'Task not active, skipping next reminder',
          { taskId, status: task.status },
          userId
        );
        return;
      }

      // Check if deadline passed
      if (new Date() >= deadline) {
        await logger.info(
          'notification',
          'Deadline passed, no more reminders',
          { taskId, deadline: deadline.toISOString() },
          userId
        );
        return;
      }

      // Get user with preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { preferences: true },
      });

      if (!user?.preferences) {
        throw new Error('User preferences not found');
      }

      // Compute next notification time (frequency-based)
      const nextNotif = notificationScheduler.computeNextNotificationTime(
        new Date(),
        user,
        deadline,
        true // isFrequencyBased = true
      );

      // If no valid next time, stop scheduling
      if (!nextNotif) {
        await logger.info(
          'notification',
          'No valid next notification time, stopping reminders',
          { taskId },
          userId
        );
        return;
      }

      // Create next notification
      await this.createNotification(userId, dreamId, taskId, nextNotif);

      await logger.info(
        'notification',
        'Next frequency-based reminder scheduled',
        {
          taskId,
          scheduledAt: nextNotif.scheduledAt.toISOString(),
        },
        userId
      );
    } catch (error: any) {
      await logger.error('notification', 'Failed to schedule next reminder', {
        error: error.message,
        taskId,
      });
    }
  }

  /**
   * Archive all future notifications for a task (on completion)
   */
  async archiveFutureNotifications(taskId: string, userId: string): Promise<void> {
    try {
      const archived = await prisma.notification.updateMany({
        where: {
          taskId,
          status: NotificationStatus.SCHEDULED,
        },
        data: {
          status: NotificationStatus.ARCHIVED,
        },
      });

      if (archived.count > 0) {
        await logger.info(
          'notification',
          `Archived ${archived.count} future notifications`,
          { taskId },
          userId
        );
      }
    } catch (error: any) {
      await logger.error('notification', 'Failed to archive notifications', {
        error: error.message,
        taskId,
      });
    }
  }

  /**
   * Get due notifications (for worker)
   */
  async getDueNotifications(limit: number = 100): Promise<any[]> {

    return prisma.notification.findMany({
      where: {
        status: NotificationStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      include: {
        user: { include: { preferences: true, tasks: { select: { id: true } } } }, // Fetch basic user data + prefs
        task: {
          include: {
            checkpoints: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        dream: true,
      },
    });
  }

  /**
   * Mark notification as sent
   */
  async markNotificationSent(notificationId: string): Promise<void> {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.SENT },
      });
    } catch (error: any) {
      await logger.error('notification', 'Failed to mark notification sent', {
        error: error.message,
        notificationId,
      });
    }
  }

  /**
   * Update notification message and metadata (e.g. after LLM generation)
   */
  async updateNotificationMessage(
    notificationId: string,
    message: string,
    metadata?: any
  ): Promise<void> {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          message,
          metadata,
        },
      });
    } catch (error: any) {
      await logger.error('notification', 'Failed to update notification message', {
        error: error.message,
        notificationId,
      });
    }
  }

  async listNotifications(userId: string, limit: number = 50, skip: number = 0): Promise<any[]> {
    return prisma.notification.findMany({
      where: {
        userId,
        status: NotificationStatus.SENT,
      },
      orderBy: { scheduledAt: 'desc' },
      take: limit,
      skip: skip,
    });
  }

  /**
   * Check for daily progress prompts (Evening Routine)
   * Called by cron
   */
  async checkDailyProgress(): Promise<void> {
    try {
      const now = new Date();

      // Find users with active tasks
      const users = await prisma.user.findMany({
        where: {
          tasks: {
            some: {
              status: { in: ['PENDING', 'IN_PROGRESS'] },
            },
          },
        },
        include: {
          preferences: true,
          tasks: {
            where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
            include: { checkpoints: true },
          },
        },
      });

      for (const user of users) {
        if (!user.preferences) continue;
        const timezone = user.timezone || 'UTC';
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const currentHour = userTime.getHours();

        // 1. Check Time Window (Evening > 18:00)
        // Avoid night (e.g. > 22:00) if we want? User said "Evening window (e.g., after 6 PM)".
        // Let's say 18:00 - 22:00.
        if (currentHour < 18 || currentHour > 22) continue;

        // Check if we already asked TODAY
        const startOfUserDay = new Date(userTime);
        startOfUserDay.setHours(0, 0, 0, 0); // Local midnight
        // We need to query notifications sent/created today relative to UTC, but logic is "responded today".
        // Actually, check if we Created a PROGRESS_CHECK notification today
        // Approximate by checking UTC time range for simplicity or just check last notification type.

        const existingPrompt = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: 'PROGRESS_CHECK',
            createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }, // Roughly last 12-24 hrs?
            // Better: gte Today's start in UTC? 
            // Let's just use "created within last 18 hours" to cover "today".
          },
        });

        if (existingPrompt) continue;

        for (const task of user.tasks) {
          // 2. Check for Checkpoint due TODAY (Local Time)
          const dueCheckpoint = task.checkpoints.find(cp => {
            const cpDate = new Date(cp.targetDate); // UTC
            // Compare cpDate (UTC) converted to User Date vs User Today
            // Checkpoints usually stored as Date objects (UTC). 
            // If targetDate is "2023-10-27T00:00:00Z", does that mean local?
            // Usually we treat dates as local dates stored in UTC (Target Date = Midnight UTC).
            // Let's assume strict date matching.
            const cpLocal = new Date(cpDate.toLocaleString('en-US', { timeZone: timezone }));
            return (
              cpLocal.getDate() === userTime.getDate() &&
              cpLocal.getMonth() === userTime.getMonth() &&
              cpLocal.getFullYear() === userTime.getFullYear() &&
              !cp.isCompleted
            );
          });

          if (!dueCheckpoint) continue;

          // 3. Check lastProgressAt
          if (task.lastProgressAt) {
            const lastProgressLocal = new Date(task.lastProgressAt.toLocaleString('en-US', { timeZone: timezone }));
            if (
              lastProgressLocal.getDate() === userTime.getDate() &&
              lastProgressLocal.getMonth() === userTime.getMonth() &&
              lastProgressLocal.getFullYear() === userTime.getFullYear()
            ) {
              // updated today
              continue;
            }
          }

          // CONDITIONS MET -> Send Notification
          await this.createNotification(user.id, task.dreamId, task.id, {
            scheduledAt: now, // Send immediately (Just-in-Time)
            message: "Just checking in — how did today's plan go? You can share progress if you want, or continue tomorrow.",
            type: 'PROGRESS_CHECK' as any, // Cast to avoid type error if strictly typed elsewhere
            metadata: {
              taskId: task.id,
              progress: task.progressPercent || 0,
              actions: [
                { label: 'Update Progress', action: 'UPDATE_PROGRESS', value: 'slider' },
                { label: 'Skip for today', action: 'SKIP_TODAY' }
              ]
            }
          });

          // Only send ONE progress check per evening (even if multiple tasks)
          // to avoid spamming.
          break;
        }
      }

    } catch (error: any) {
      await logger.error('notification', 'Failed to check daily progress', { error: error.message });
    }
  }
}

export const notificationService = new NotificationService();