// src/modules/notification/notification.worker.ts
import { logger } from '../../utils/logger';
import { notificationService } from './notification.service';
import { notificationScheduler } from './notification.scheduler';
import { notificationDispatcher } from './dispatcher';
import prisma from '../../config/database';

export class NotificationWorker {
  private pollInterval = 60 * 1000; // 1 minute (60 seconds)
  private running = false;
  private pollTimeout: NodeJS.Timeout | null = null;

  /**
   * Start the notification worker
   * Runs independently from event worker
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await logger.info('notification', 'Notification worker started', {
      pollInterval: `${this.pollInterval / 1000} seconds`,
    });

    this.poll();
  }

  /**
   * Stop the notification worker
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    await logger.info('notification', 'Notification worker stopped');
  }

  /**
   * Main polling loop
   * Runs every minute (60 seconds)
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      // Get all due notifications
      // Note: Now includes task.checkpoints
      const dueNotifications = await notificationService.getDueNotifications();

      if (dueNotifications.length > 0) {
        await logger.info(
          'notification',
          `Processing ${dueNotifications.length} due notifications`,
          { count: dueNotifications.length }
        );

        // Process each notification
        for (const notification of dueNotifications) {
          await this.processNotification(notification);
        }
      }
    } catch (error: any) {
      await logger.error('notification', 'Notification worker poll failed', {
        error: error.message,
      });
    }

    // Schedule next poll
    this.pollTimeout = setTimeout(() => this.poll(), this.pollInterval);
  }

  /**
   * Process a single notification
   * Phase-1 Logic:
   * 1. Gather Rich Context (Checkpoints, Progress, Time)
   * 2. Call LLM for Friendly Message
   * 3. Attach Actions (Buttons)
   * 4. Send & Log
   * 5. Schedule STRICTLY ONE next reminder
   */
  private async processNotification(notification: any): Promise<void> {
    try {
      // Mark as PROCESSING to prevent double picks (if we had concurrency, but here single worker)
      // Actually DB status isn't updated to PROCESSING in getDue, but that's fine for single instance.

      const { id, userId, taskId, dreamId, type, task, user, dream } = notification;

      // 1. CALCULATE CONTEXT UTIL
      const now = new Date();
      const currentHour = now.getHours();
      let timeOfDay: 'morning' | 'afternoon' | 'evening' = 'afternoon';
      if (currentHour < 12) timeOfDay = 'morning';
      else if (currentHour >= 17) timeOfDay = 'evening';

      let currentCheckpoint = null;
      let progressInfo = undefined;

      if (task) {
        // Find checkpoint for TODAY
        // Naive date match or based on task duration? Plan says "Today's task checkpoint (based on date)"
        // We can match targetDate with Today.
        if (task.checkpoints && task.checkpoints.length > 0) {
          const todayStr = now.toISOString().split('T')[0];
          currentCheckpoint = task.checkpoints.find((cp: any) =>
            new Date(cp.targetDate).toISOString().split('T')[0] === todayStr
          );
          // Fallback: If no checkpoint strictly for today, maybe the next pending one?
          if (!currentCheckpoint) {
            currentCheckpoint = task.checkpoints.find((cp: any) => !cp.isCompleted);
          }
        }

        // // Progress Info
        // // Expected Progress: Simple time-based linear?
        // let expected = 0;
        // if (task.startDate && task.deadline) {
        //   const totalDuration = new Date(task.deadline).getTime() - new Date(task.startDate).getTime();
        //   const elapsed = now.getTime() - new Date(task.startDate).getTime();
        //   expected = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
        // }
        let expected = 0;

        if (currentCheckpoint) {
          expected = calculateExpectedCheckpointProgress(
            currentCheckpoint,
            now,
            user.preferences
          );
        }

        progressInfo = {
          current: task.progressPercent || 0,
          lastUpdated: task.lastProgressAt ? new Date(task.lastProgressAt) : undefined,
          expected
        };
      }

      // 2. GENERATE MESSAGE WITH LLM
      // Only for REMINDER/MOTIVATIONAL. System msgs might be static.
      let messageText = notification.message; // Default/fallback

      if (type === 'REMINDER' || type === 'MOTIVATIONAL') {
        const { generateNotificationMessageWithLLM } = require('./llm-provider');
        const { analyticsService } = require('../analytics/analytics.service');
        const { subDays } = require('date-fns');

        // Fetch live sprint analytics
        let currentSprintDashboard = null;
        let pastSnapshot = null;

        try {
          // Live calculation
          currentSprintDashboard = await analyticsService.computeDashboard(userId, now);

          // Get the previous week's finalized snapshot for historical state comparison
          const todayStr = now.toISOString().split('T')[0];
          const sprintStartStr = currentSprintDashboard?.sprintWindow?.start || todayStr;
          const currentWeekStart = new Date(sprintStartStr + 'T12:00:00Z');
          const previousWeekStart = subDays(currentWeekStart, 7);

          const { PrismaClient } = require('@prisma/client');
          const prisma = new PrismaClient();

          pastSnapshot = await prisma.userInsightSnapshot.findFirst({
            where: { userId, dreamId: null, weekStart: previousWeekStart }
          });
        } catch (e: any) {
          await logger.warn('notification', 'Failed to fetch analytics for prompt context', { error: e.message });
        }

        // Format the input strictly to match our new JSON-like LLM spec
        const llmInput = {
          notificationType: type,
          userTone: user.preferences?.motivationTone || 'NEUTRAL',

          userIdentity: {
            dreamTitle: dream?.title || 'Your Dream',
            motivationStatement: dream?.motivationStatement || 'To achieve greatness.',
            deadlineInDays: dream?.deadline ? Math.round((new Date(dream.deadline).getTime() - now.getTime()) / (1000 * 3600 * 24)) : 30,
            tone: user.preferences?.motivationTone || 'NEUTRAL',
          },

          currentSprint: currentSprintDashboard ? {
            disciplineScore: currentSprintDashboard.scores.disciplineScore,
            activeDays: `${currentSprintDashboard.activity.activeDays}/7`,
            lateCheckpoints: currentSprintDashboard.checkpoints.recovered.count + currentSprintDashboard.checkpoints.overduePending.count,
            overdueTasks: currentSprintDashboard.checkpoints.overduePending.count,
            currentStreak: 0, // Placeholder
            effortTrend: 'N/A', // Calculated at week end usually, LLM can infer from activeDays
            remainingWorkPercent: currentSprintDashboard.checkpoints.planned.count > 0
              ? Math.round(100 - currentSprintDashboard.rates.executionRate) : 0,
            behavioralState: 'LIVE_COMPUTING',
          } : undefined,

          pastSprint: pastSnapshot ? {
            disciplineScore: pastSnapshot.disciplineScore,
            disciplineTrend: 'N/A', // LLM will compare past vs current discipline
            behavioralState: pastSnapshot.behavioralState || 'STABLE',
          } : undefined,

          today: {
            checkpointTitle: currentCheckpoint?.title || task?.title || 'Daily Focus',
            currentProgress: progressInfo?.current || 0,
            target: progressInfo?.expected || 100,
            isBehindSchedule: (progressInfo?.current || 0) < (progressInfo?.expected || 0),
            hoursLeftToday: Math.max(0, 24 - now.getHours()),
          }
        };

        messageText = await generateNotificationMessageWithLLM(llmInput);
      }

      // 3. ATTACH ACTIONS (Buttons)
      // Rule: If Reminder + Task Active + Morning/Evening?
      // User said: "If message asks a question (example: progress)..."
      // Simplification: Always attach progress buttons for Reminders if task not done.
      let metadata: any = undefined;

      if (type === 'REMINDER' && task && task.status !== 'COMPLETED') {
        let apiPath = `/api/tasks/${taskId}/progress`;
        if (currentCheckpoint) {
          apiPath = `/api/tasks/${taskId}/checkpoints/${currentCheckpoint.id}/progress`;
        }

        metadata = {
          pushActions: [
            { action: "add_25", title: "Add Progress" },
            { action: "mark_done", title: "Mark Done" }
          ],
          apiPath
        };
      }

      function calculateExpectedCheckpointProgress(
        checkpoint: any,
        now: Date,
        userPreferences?: any
      ): number {
        if (!checkpoint?.targetDate) return 0;

        // Define active hours (fallbacks for Phase-1)
        const startHour = 9;
        const endHour = 21;

        const dayStart = new Date(checkpoint.targetDate);
        dayStart.setHours(startHour, 0, 0, 0);

        const dayEnd = new Date(checkpoint.targetDate);
        dayEnd.setHours(endHour, 0, 0, 0);

        if (now <= dayStart) return 0;
        if (now >= dayEnd) return 100;

        const elapsed = now.getTime() - dayStart.getTime();
        const total = dayEnd.getTime() - dayStart.getTime();

        return Math.round((elapsed / total) * 100);
      }


      // save generated message back to notification? 
      // The instruction says "Generate message (AT SEND TIME ONLY)".
      // So we update the notification record with the *actual* sent message?
      // Or just log it?
      // Better to update it so history shows what was sent.
      await notificationService.updateNotificationMessage(id, messageText, metadata);

      // STEP 4: Send notification
      await this.sendNotification({
        notificationId: id,
        userId,
        taskId,
        message: messageText,
        type,
        scheduledAt: notification.scheduledAt,
        metadata
      });

      // STEP 5: Mark as SENT
      await notificationService.markNotificationSent(id);

      await logger.info(
        'notification',
        'Notification sent and marked',
        {
          notificationId: id,
          type,
          userId,
          taskId,
          messageChunk: messageText.substring(0, 20) + '...'
        },
        userId
      );

      // STEP 6: Schedule next reminder
      if (taskId && type === 'REMINDER' && task) {
        // Check if task is still active
        if (task.status === 'COMPLETED' || task.status === 'BLOCKED') {
          return;
        }

        // (REMOVED: The deadline-based exit has been removed here to ensure
        // overdue tasks continue to trigger reminders until completed or blocked.)

        // Schedule ONE next reminder
        await notificationService.scheduleNextReminder(
          userId,
          taskId,
          dreamId,
          new Date(task.deadline)
        );
      }
    } catch (error: any) {
      await logger.error('notification', 'Failed to process notification', {
        error: error.message,
        notificationId: notification.id,
      });
    }
  }

  /**
   * Send notification (MVP: console log)
   */
  private async sendNotification(options: {
    notificationId: string;
    userId: string;
    taskId?: string;
    message: string;
    type: string;
    scheduledAt: Date;
    metadata?: any;
  }): Promise<void> {
    const { notificationId, userId, taskId, message, type, scheduledAt, metadata } = options;

    try {
      // Fetch full notification object for dispatcher
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { user: true, task: true, dream: true }
      });

      if (!notification) {
        throw new Error(`Notification ${notificationId} not found`);
      }

      // Dispatch to all channels (Web Push, WebSocket, and CHAT HISTORY)
      const dispatchResult = await notificationDispatcher.dispatch({
        notification,
        user: notification.user,
        task: notification.task,
        dream: notification.dream
      });

      if (!dispatchResult.success) {
        throw new Error(`Dispatch failed: ${dispatchResult.errors.join(', ')}`);
      }

      await logger.info(
        'notification',
        `[DISPATCHED] ${type}: ${message}`,
        {
          userId,
          notificationId,
          channels: 'all'
        },
        userId
      );
    } catch (error: any) {
      await logger.error('notification', 'Dispatch failed in worker', {
        error: error.message,
        notificationId
      });
      // Don't throw, let the worker continue
    }
  }
}

export const notificationWorker = new NotificationWorker();