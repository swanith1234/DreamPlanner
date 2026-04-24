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
              },
              roadmaps: {
                where: { status: 'ACTIVE' },
                include: {
                  milestones: {
                    where: { status: 'PENDING' },
                    orderBy: { orderIndex: 'asc' }
                  }
                }
              }
            }
          },
        },
      });

      if (!notification) {
        await logger.warn('notification', 'Notification not found for processing', { notificationId });
        return;
      }

      // Ensure Dream is ACTIVE if there is a dream
      if (notification.dream && ['COMPLETED', 'ARCHIVED', 'FAILED'].includes(notification.dream.status)) {
        await logger.info('notification', 'Dream not active, skipping notification processing', { dreamId: notification.dreamId });
        return;
      }

      // CASE 3: No Active Dreams (The Nudge / Case Zero)
      // If there is no dream associated and type is MOTIVATIONAL/REMINDER, we inject the hardcoded message here.
      if (!notification.dream) {
        const CASE_ZERO_MESSAGES = [
          "Your potential is waiting. Define a new dream today and take the first step.",
          "Every journey starts with a single step. What is your next big dream?",
          "A goal without a timeline is just a wish. Let's build your next roadmap.",
          "Don't wait for the perfect moment. Create your next dream and start now.",
          "You've shown what you're capable of. What's next? Set a new dream today.",
          "Greatness requires a destination. Take 5 minutes to define your next goal.",
          "Your future self is depending on what you do today. Start a new dream.",
          "Ready for the next challenge? Break it down and build your roadmap.",
          "Momentum is your best friend. Don't lose it. Set your next dream now.",
          "The only limits are the ones you set. Dream big, plan smart."
        ];
        
        // JIT Content Generation for Case 3
        if (notification.type === 'REMINDER' || notification.type === 'MOTIVATIONAL') {
           const randomMessage = CASE_ZERO_MESSAGES[Math.floor(Math.random() * CASE_ZERO_MESSAGES.length)];
           notification.message = randomMessage;
           
           await prisma.notification.update({
             where: { id: notificationId },
             data: { message: randomMessage }
           });
        }
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

      // STEP 2.5: JIT Content Generation (LLM) utilizing 3-State Logic
      if (notification.dream && notification.type === 'REMINDER' && notification.user.preferences) {
        try {
          const now = new Date();
          const allTasks = notification.dream.tasks || [];
          const activeTasks = allTasks.filter(t => ['PENDING', 'IN_PROGRESS'].includes(t.status));

          // Calculate Case Type
          let caseType: 'Case1' | 'Case2' = activeTasks.length > 0 ? 'Case1' : 'Case2';
          
          let extractedSuggestedTask: any = null;

          const llmInputPayload: any = {
             notificationType: 'REMINDER',
             caseType,
             userTone: notification.user.preferences.motivationTone,
             userIdentity: {
               dreamTitle: notification.dream.title,
               motivationStatement: notification.dream.motivationStatement || 'Stay focused.',
               agentName: notification.user.preferences.agentName || `IgniteMate`,
             },
             statusEvaluation: {}
          };

          if (caseType === 'Case1') {
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const timeRemainingInDay = Math.floor((endOfDay.getTime() - now.getTime()) / (1000 * 60 * 60));
            const todaysCheckpoints = activeTasks.flatMap(t => t.checkpoints).map(c => c.title);
            const progressMadeToday = activeTasks.map(t => `${t.title} (${t.progressPercent || 0}% done)`).join(', ');
            
            llmInputPayload.statusEvaluation = {
              progressMadeToday,
              timeRemainingInDay,
              todaysCheckpoints
            };
          } else {
            // Case 2: Next Step Proposal
            const completedTasksRecords = await prisma.task.findMany({
              where: { dreamId: notification.dream.id, status: 'COMPLETED' },
              orderBy: { completedAt: 'desc' },
              take: 3
            });
            const completedTasksString = completedTasksRecords.map(t => t.title).join(', ') || 'No previously completed tasks recent.';
            
             // @ts-ignore - Prisma relations queried above
            const roadmaps = (notification.dream as any).roadmaps;
            let firstPendingMilestone = 'No visual roadmap defined. Suggest a logical next step.';
            let pendingMilestoneId = null;

            if (roadmaps && roadmaps.length > 0 && roadmaps[0].milestones.length > 0) {
              firstPendingMilestone = roadmaps[0].milestones[0].title;
              pendingMilestoneId = roadmaps[0].milestones[0].id;
            }

            llmInputPayload.statusEvaluation = {
              completedTasks: completedTasksString,
              firstPendingMilestone
            };
            
            // Preset for extraction
            extractedSuggestedTask = { milestoneId: pendingMilestoneId };
          }

          const llmResult = await generateNotificationMessageWithLLM(llmInputPayload);

          if (llmResult.message) {
             notification.message = llmResult.message;
             let metadataUpdate = notification.metadata ? (typeof notification.metadata === 'string' ? JSON.parse(notification.metadata) : notification.metadata) : {};

             if (caseType === 'Case2') {
               // Include the metadata required by intent pipeline
               extractedSuggestedTask.title = llmResult.extractedTaskTitle;
               metadataUpdate.suggestedTask = extractedSuggestedTask;
             }
             
             notification.metadata = metadataUpdate;

             await prisma.notification.update({
               where: { id: notificationId },
               data: { message: notification.message, metadata: metadataUpdate }
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
        } else if (!notification.dreamId && (notification.type === 'REMINDER' || notification.type === 'MOTIVATIONAL')) {
          // Schedule next Case 3 Nudge
          let frequency = 1;
          if (notification.user?.preferences?.notificationFrequency) {
            frequency = notification.user.preferences.notificationFrequency * 2; // Prompt: If set to 2 per day, send 4 per day.
          }
          // Calculate hours until next occurrence based on frequency per day
          const hoursUntilNext = Math.max(24 / frequency, 1);
          const nextScheduledAt = new Date(Date.now() + hoursUntilNext * 60 * 60 * 1000);

          await this.createNotification(notification.userId, null, null, {
            scheduledAt: nextScheduledAt,
            message: "Upcoming Nudge",
            type: notification.type,
            metadata: {}
          } as any);
          
          await logger.info('notification', 'Next zero-dream nudge scheduled', { scheduledAt: nextScheduledAt }, notification.userId);
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