// src/modules/notification/notification.service.ts
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { notificationScheduler, ScheduledNotification } from './notification.scheduler';
import { User, Task, NotificationStatus } from '@prisma/client';


import { eventService } from '../event/event.service';
import { pushService } from './push.service';
import { generateNotificationMessageWithLLM } from './llm-provider';
import { notificationDispatcher } from './dispatcher';

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
   * Schedule the initial immediate notification when a Dream is created.
   * This anchors the Dream to the cron schedule and kicks off the frequency cycle.
   */
  async schedulePreStartReminders(
    userId: string,
    taskId: string | null,
    dreamId: string,
    startDate: Date
  ): Promise<void> {
    try {
      const created = await this.createNotification(userId, dreamId, taskId, {
        scheduledAt: new Date(),
        message: "IgniteMate initialized for this Dream.",
        type: 'REMINDER', // REMINDER triggers scheduleNextDreamReminder after success
      });

      await logger.info(
        'notification',
        'Scheduled immediate initial dream notification',
        { dreamId },
        userId
      );

      // Bypass cron timer: manually lock and trigger immediate processing
      const locked = await prisma.notification.updateMany({
        where: { id: created.id, status: NotificationStatus.SCHEDULED },
        data: { status: NotificationStatus.PROCESSING },
      });

      if (locked.count > 0) {
        // Fire-and-forget
        this.processNotification(created.id, 0).catch(err => {
           logger.error('notification', 'Immediate processing fire failed', { error: err.message, notificationId: created.id });
        });
      }
    } catch (error: any) {
      await logger.error('notification', 'Failed to schedule initial dream notification', {
        error: error.message,
        dreamId,
      });
    }
  }

  /**
   * Schedule next frequency-based reminder
   * Called by notification worker after marking notification as SENT
   */
  /**
   * Schedule next frequency-based reminder for the Dream
   */
  async scheduleNextDreamReminder(
    userId: string,
    dreamId: string,
    deadline: Date
  ): Promise<void> {
    try {
      // Check if parent dream is active
      const dream = await prisma.dream.findUnique({
        where: { id: dreamId },
        select: { status: true }
      });

      if (!dream || dream.status === 'ARCHIVED' || dream.status === 'COMPLETED' || dream.status === 'FAILED') {
        await logger.info(
          'notification',
          'Parent dream not active, skipping next reminder',
          { dreamId, dreamStatus: dream?.status },
          userId
        );
        return;
      }

      // (REMOVED: The logic here used to terminate reminders when new Date() >= deadline.
      // This has been removed so the user is actively reminded about overdue tasks.)

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
          { dreamId },
          userId
        );
        return;
      }

      // Create next notification tied to Dream
      await this.createNotification(userId, dreamId, null, nextNotif);

      await logger.info(
        'notification',
        'Next frequency-based reminder scheduled',
        {
          dreamId,
          scheduledAt: nextNotif.scheduledAt.toISOString(),
        },
        userId
      );
    } catch (error: any) {
      await logger.error('notification', 'Failed to schedule next reminder', {
        error: error.message,
        dreamId,
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
        // Double safety: Ensure we don't pick up notifications for archived parents
        // if they weren't cancelled properly for some reason
        AND: [
          {
            OR: [
              { dream: { status: { not: 'ARCHIVED' } } },
              { dreamId: null } // System notifications might not have dream
            ]
          },
          {
            OR: [
              { task: { status: { not: 'ARCHIVED' } } },
              { taskId: null }
            ]
          }
        ]
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

        // Did we already send a PROGRESS_CHECK today (in user's local calendar day)?
        // Compute UTC equivalent of user's local midnight
        const userMidnight = new Date(userTime);
        userMidnight.setHours(0, 0, 0, 0);
        // Convert back to UTC: subtract the timezone offset that toLocaleString applied
        const offsetMs = userTime.getTime() - now.getTime(); // local time delta
        const userMidnightUTC = new Date(userMidnight.getTime() - offsetMs);

        const existingPrompt = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: 'PROGRESS_CHECK',
            createdAt: { gte: userMidnightUTC },
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

  /**
   * Process a single notification (Shared by BullMQ worker and Sync Fallback)
   */
  async processNotification(notificationId: string, attempt: number = 0): Promise<void> {
    try {
      // STEP 1: Fetch notification with full Dream context
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          user: {
            include: { preferences: true }
          },
          dream: {
            include: {
              tasks: {
                include: { checkpoints: true }
              }
            }
          },
        },
      });

      if (!notification || !notification.dream) {
        await logger.warn('notification', 'Notification or Dream not found for processing', { notificationId });
        return;
      }

      // Ensure Dream is ACTIVE
      if (['COMPLETED', 'ARCHIVED', 'FAILED'].includes(notification.dream.status)) {
        await logger.info('notification', 'Dream not active, skipping notification processing', { dreamId: notification.dreamId });
        return;
      }

      // STEP 2: Check if already processed (idempotency)
      if (notification.status !== NotificationStatus.PROCESSING) {
        await logger.info(
          'notification',
          'Notification skipping: status is not PROCESSING',
          { notificationId, status: notification.status }
        );
        return;
      }

      // STEP 2.5: JIT Content Generation (LLM)
      if (notification.type === 'REMINDER' && notification.user.preferences) {
        try {
          const now = new Date();
          // Lazy load services to avoid cyclic dependencies
          const { analyticsService } = require('../analytics/analytics.service');
          const { subDays } = require('date-fns');

          let currentSprintDashboard = null;
          let pastSnapshot = null;

          try {
            currentSprintDashboard = await analyticsService.computeDashboard(notification.userId, now);
            const sprintStr = currentSprintDashboard?.sprintWindow?.start || now.toISOString().split('T')[0];
            const prevWeekStart = subDays(new Date(sprintStr + 'T12:00:00Z'), 7);
            pastSnapshot = await prisma.userInsightSnapshot.findFirst({
              where: { userId: notification.userId, dreamId: null, weekStart: prevWeekStart }
            });
          } catch (e) {
            // Fallback if analytics fails
          }

          // Evaluate Tasks for Case A/B/C
          const allTasks = notification.dream.tasks || [];
          const inProgressTasks = allTasks.filter(t => (t.progressPercent || 0) > 0 && t.status !== 'COMPLETED' && t.status !== 'ARCHIVED');
          const pendingTasks = allTasks.filter(t => (t.progressPercent || 0) === 0 && t.status !== 'ARCHIVED');

          let caseType = 'C';
          let caseContext = "No active or pending tasks. Suggest planning the next milestone.";
          if (inProgressTasks.length > 0) {
            caseType = 'A';
            caseContext = `User actively working on: ${inProgressTasks.map(t => t.title).join(', ')}`;
          } else if (pendingTasks.length > 0) {
            caseType = 'B';
            caseContext = `User has pending tasks to start: ${pendingTasks.map(t => t.title).join(', ')}`;
          }

          // Evaluate ON_TRACK vs LAGGING
          const isLagging = currentSprintDashboard ? (currentSprintDashboard.scores.disciplineScore < 60 || currentSprintDashboard.checkpoints.overduePending.count > 0) : false;
          const statusFlag = isLagging ? 'LAGGING' : 'ON_TRACK';

          const llmMessage = await generateNotificationMessageWithLLM({
            notificationType: 'REMINDER',
            userTone: notification.user.preferences.motivationTone,
            userIdentity: {
              dreamTitle: notification.dream.title,
              motivationStatement: notification.dream.motivationStatement || 'Keep pushing forward.',
              deadlineInDays: notification.dream.deadline ? Math.round((new Date(notification.dream.deadline).getTime() - now.getTime()) / 86400000) : 30,
              tone: notification.user.preferences.motivationTone,
              agentName: notification.user.preferences.agentName || `Future ${notification.user.name || 'you'}`,
            },
            statusEvaluation: {
              caseType,
              caseContext,
              statusFlag,
              disciplineScore: currentSprintDashboard?.scores.disciplineScore || 100
            }
          } as any);

          if (llmMessage) {
            notification.message = llmMessage;
            await prisma.notification.update({
              where: { id: notificationId },
              data: { message: llmMessage }
            });
          }
        } catch (err: any) {
          console.error('JIT LLM generation failed, using original message:', err.message);
        }
      }

      // STEP 3: Dispatch notification
      const dispatchResult = await notificationDispatcher.dispatch({
        notification,
        user: (notification as any).user,
        task: (notification as any).task || undefined,
        dream: (notification as any).dream || undefined,
      });

      // STEP 4: Update DB based on dispatch result
      if (dispatchResult.success) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: { status: NotificationStatus.SENT }
        });

        await logger.info(
          'notification',
          'Notification sent successfully',
          { notificationId, userId: notification.userId },
          notification.userId
        );

        // STEP 5: Schedule next reminder at the Dream level
        if (notification.dreamId && notification.type === 'REMINDER') {
          await this.scheduleNextDreamReminder(
            notification.userId,
            notification.dreamId,
            notification.dream!.deadline!
          );
        }
      } else {
        // Mark as FAILED (will be retried if BullMQ is used)
        await prisma.notification.update({
          where: { id: notificationId },
          data: { status: NotificationStatus.FAILED }
        });

        throw new Error(dispatchResult.errors.join('; '));
      }
    } catch (error: any) {
      await logger.error(
        'notification',
        'Failed to process notification',
        { error: error.message, notificationId, attempt }
      );
      throw error;
    }
  }
}

export const notificationService = new NotificationService();