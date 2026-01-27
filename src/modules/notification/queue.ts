// src/modules/notification/queue.ts
import { Queue } from 'bullmq';
import { getRedisClient } from '../../config/queue';

/**
 * Job payload for notification processing
 */
export interface NotificationJobPayload {
  notificationId: string;
}

/**
 * BullMQ Queue for notifications
 * Named: 'notification-queue'
 * Options:
 * - Max retries: 5 with exponential backoff
 * - No infinite retries
 * - Delayed execution based on scheduledAt
 */
export let notificationQueue: Queue<NotificationJobPayload>;

/**
 * Initialize notification queue
 * Must be called once during app startup
 */
export async function initializeNotificationQueue(): Promise<void> {
  try {
    const redisClient = getRedisClient();

    notificationQueue = new Queue<NotificationJobPayload>(
      'notification-queue',
      {
        connection: redisClient,
        // Default job options
        defaultJobOptions: {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          // Max 5 retries
          attempts: 5,
          // Remove job after success
          removeOnComplete: {
            age: 3600, // Keep for 1 hour for inspection
          },
          // Keep failed jobs for inspection
          removeOnFail: false,
        },
      }
    );

    // Event handlers
    notificationQueue.on('error', (err: Error) => {
      console.error('Queue error:', err);
    });

    notificationQueue.on('failed' as any, (job: any, err: Error) => {
      console.error(`Job ${job.id} failed:`, err.message);
    });

    console.log('✅ Notification queue initialized');
  } catch (error: any) {
    console.error('Failed to initialize notification queue:', error.message);
    throw error;
  }
}

/**
 * Close queue gracefully
 */
export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueue) {
    await notificationQueue.close();
  }
}

/**
 * Add notification job to queue
 * Called whenever a notification is created in DB
 */
export async function enqueueNotificationJob(
  notificationId: string,
  delayMs: number
): Promise<void> {
  if (!notificationQueue) {
    throw new Error('Notification queue not initialized');
  }

  try {
    const job = await notificationQueue.add(
      'send-notification',
      { notificationId },
      {
        delay: Math.max(delayMs, 0), // Never negative delay
        jobId: `notif-${notificationId}`, // Unique job ID prevents duplicates
      }
    );

    console.log(`📋 Job enqueued: ${job.id} (delay: ${delayMs}ms)`);
  } catch (error: any) {
    console.error('Failed to enqueue notification job:', error.message);
    throw error;
  }
}