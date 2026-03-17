// src/modules/notification/queue-worker.ts
import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../config/queue';
import { generateNotificationMessageWithLLM } from './llm-provider';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { notificationDispatcher } from './dispatcher';
import { notificationService } from './notification.service';
import { NotificationJobPayload } from './queue';
import { NotificationStatus, TaskStatus } from '@prisma/client';

/**
 * Production-grade BullMQ worker for notifications
 * Processes jobs at exact scheduled time (no polling needed)
 * 
 * Features:
 * - Atomic DB updates (SCHEDULED → PROCESSING → SENT/FAILED)
 * - Idempotency protection (prevents duplicate processing)
 * - Automatic retries with exponential backoff
 * - Comprehensive error logging
 * - Next notification scheduling
 */
export class NotificationQueueWorker {
  private worker: Worker<NotificationJobPayload> | null = null;

  /**
   * Initialize and start worker
   */
  async start(): Promise<void> {
    try {
      const redisClient = getRedisClient();

      this.worker = new Worker<NotificationJobPayload>(
        'notification-queue',
        async (job) => await this.processJob(job),
        {
          connection: redisClient,
          concurrency: 10,
          // Worker name for monitoring
          name: 'notification-processor',
          // Optimize for serverless/Upstash Redis
         
        }
      );

      // Event handlers
      this.worker.on('completed', (job) => {
        console.log(`✅ Job completed: ${job.id}`);
      });

      this.worker.on('failed', (job, err) => {
        console.error(`❌ Job failed: ${job?.id} - ${err.message}`);
      });

      this.worker.on('error', (err) => {
        console.error('Worker error:', err);
      });

      await logger.info('queue', 'Notification queue worker started');
    } catch (error: any) {
      await logger.error('queue', 'Failed to start notification worker', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process a single notification job
   * CRITICAL: Must be idempotent and handle concurrency
   */
  private async processJob(job: Job<NotificationJobPayload>): Promise<void> {
    const { notificationId } = job.data;

    try {
      await notificationService.processNotification(notificationId, job.attemptsMade);
    } catch (error: any) {
      await logger.error(
        'queue',
        'Failed to process notification job via worker',
        {
          error: error.message,
          notificationId,
          attempt: job.attemptsMade,
        }
      );
      throw error; // Re-throw for BullMQ to retry
    }
  }

  /**
   * Schedule next frequency-based reminder
   * Only for REMINDER type notifications on tasks
   */
  private async scheduleNextReminder(notification: any): Promise<void> {
    try {
      const { taskId, userId, dreamId } = notification;

      // Verify task still exists and is active
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        await logger.info('queue', 'Task not found for next reminder', { taskId }, userId);
        return;
      }

      // Check if task is still active
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.BLOCKED) {
        await logger.info(
          'queue',
          'Task not active, skipping next reminder',
          { taskId, status: task.status },
          userId
        );
        return;
      }

      // (REMOVED: The check for deadline expiration blocking next reminders
      // has been removed to continue reminding the user about overdue tasks)

      // Schedule next reminder via notification service
      // This will create notification in DB + enqueue to BullMQ
      await notificationService.scheduleNextReminder(userId, taskId, dreamId, task.deadline);

      await logger.info(
        'queue',
        'Next reminder scheduled',
        { taskId, userId },
        userId
      );
    } catch (error: any) {
      await logger.error('queue', 'Failed to schedule next reminder', {
        error: error.message,
      });
      // Don't throw - this is a best-effort operation
    }
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      await logger.info('queue', 'Notification queue worker stopped');
    }
  }
}

export const notificationQueueWorker = new NotificationQueueWorker();