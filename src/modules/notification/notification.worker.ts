// src/modules/notification/notification.worker.ts
import { logger } from '../../utils/logger';
import { notificationService } from './notification.service';
import { notificationScheduler } from './notification.scheduler';

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
        // Use our wrapper
        // We need to import generateNotificationMessageWithLLM from llm-provider
        const { generateNotificationMessageWithLLM } = require('./llm-provider');

        messageText = await generateNotificationMessageWithLLM({
          notificationType: type,
          userTone: user.preferences?.motivationTone || 'NEUTRAL',
          task,
          dream,
          checkpoint: currentCheckpoint,
          progress: progressInfo,
          timeOfDay
        });
      }

      // 3. ATTACH ACTIONS (Buttons)
      // Rule: If Reminder + Task Active + Morning/Evening?
      // User said: "If message asks a question (example: progress)..."
      // Simplification: Always attach progress buttons for Reminders if task not done.
      let metadata: any = undefined;

      if (type === 'REMINDER' && task && task.status !== 'COMPLETED') {
        metadata = {
          actions: [
            { label: "10%", api: `POST /tasks/${taskId}/progress`, value: 10 },
            { label: "25%", api: `POST /tasks/${taskId}/progress`, value: 25 },
            { label: "50%", api: `POST /tasks/${taskId}/progress`, value: 50 },
            { label: "Skip for now", api: null }
          ]
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

        // Check if deadline passed
        const now = new Date();
        if (now >= new Date(task.deadline)) {
          return;
        }

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
    userId: string;
    taskId?: string;
    message: string;
    type: string;
    scheduledAt: Date;
    metadata?: any;
  }): Promise<void> {
    const { userId, taskId, message, type, scheduledAt, metadata } = options;

    // MVP: Console log (Chat Style)
    console.log(`\n---------------------------------------------------`);
    console.log(`[CHAT NOTIFICATION] To: ${userId}`);
    console.log(`[${type}] ${message}`);
    if (metadata && metadata.actions) {
      console.log(`[ACTIONS]: ${metadata.actions.map((a: any) => `[${a.label}]`).join(' ')}`);
    }
    console.log(`---------------------------------------------------\n`);

    // Log to database
    await logger.info(
      'notification',
      `[SEND] ${type}: ${message}`,
      {
        userId,
        taskId,
        scheduledAt: scheduledAt.toISOString(),
        hasActions: !!metadata
      },
      userId
    );
  }
}

export const notificationWorker = new NotificationWorker();