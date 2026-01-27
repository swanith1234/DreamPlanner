// src/modules/event/event.handlers.ts
import { DomainEvent } from '@prisma/client';
import { logger } from '../../utils/logger';
import { notificationService } from '../notification/notification.service';
import { notificationScheduler, ScheduledNotification } from '../notification/notification.scheduler';

export class EventHandlers {
  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case 'task.created':
        await this.handleTaskCreated(event);
        break;
      case 'task.completed':
        await this.handleTaskCompleted(event);
        break;
      case 'dream.created':
        await this.handleDreamCreated(event);
        break;
      case 'dream.completed':
        await this.handleDreamCompleted(event);
        break;
      default:
        await logger.warn('event', `Unknown event type: ${event.eventType}`);
    }
  }

  /**
   * Handle task.created event
   * Schedule pre-start reminders ONLY
   * No frequency-based scheduling yet (task hasn't started)
   */
  private async handleTaskCreated(event: DomainEvent): Promise<void> {
    const { taskId, dreamId, userId, startDate, deadline } = event.payload as {
      taskId: string;
      dreamId: string;
      userId: string;
      startDate: string;
      deadline: string;
    };

    try {
      // Check if startDate is in the future
      const now = new Date();
      const taskStartDate = new Date(startDate);

      if (taskStartDate > now) {
        // Task hasn't started yet - schedule pre-start reminders
        await notificationService.schedulePreStartReminders(
          userId,
          taskId,
          dreamId,
          taskStartDate
        );

        await logger.info(
          'event',
          'Task created: pre-start reminders scheduled',
          { taskId, startDate },
          userId
        );
      } else {
        // Task starts today/already started
        // Schedule first frequency-based reminder
        const deadlineDate = new Date(deadline);
        const nextReminder = notificationScheduler.computeNextNotificationTime(
          now,
          { timezone: 'UTC', preferences: { sleepStart: '23:30', sleepEnd: '06:30', quietHours: [], notificationFrequency: 60 } } as any,
          deadlineDate,
          true // isFrequencyBased
        );

        if (nextReminder) {
          const reminderNotification: ScheduledNotification = {
            scheduledAt: new Date(),
            message: 'Task reminder: Time to work on your task!',
            type: 'REMINDER',
          };
          
          await notificationService.createNotification(
            userId,
            dreamId,
            taskId,
            reminderNotification
          );

          await logger.info(
            'event',
            'Task created (immediate start): first frequency reminder scheduled',
            { taskId },
            userId
          );
        }
      }
    } catch (error: any) {
      await logger.error('event', 'Failed to handle task.created', {
        error: error.message,
        taskId,
      });
    }
  }

  /**
   * Handle task.completed event
   * Archive all future notifications for this task
   */
  private async handleTaskCompleted(event: DomainEvent): Promise<void> {
    const { taskId, userId } = event.payload as {
      taskId: string;
      userId: string;
      dreamId: string;
    };

    try {
      // Archive future notifications
      await notificationService.archiveFutureNotifications(taskId, userId);

      // Create celebratory notification
      const celebration: ScheduledNotification = {
        scheduledAt: new Date(),
        message: '✅ Great job! Task completed! Keep the momentum going!',
        type: 'MOTIVATIONAL',
      };

      await notificationService.createNotification(
        userId,
        (event.payload as any).dreamId,
        taskId,
        celebration
      );

      await logger.info('event', 'Task completed: notifications archived & celebration sent', {
        taskId,
        userId,
      });
    } catch (error: any) {
      await logger.error('event', 'Failed to handle task.completed', {
        error: error.message,
        taskId,
      });
    }
  }

  /**
   * Handle dream.created event
   * Send motivational notification
   */
  private async handleDreamCreated(event: DomainEvent): Promise<void> {
    const { dreamId, userId, title, deadline } = event.payload as {
      dreamId: string;
      userId: string;
      title: string;
      deadline: string;
    };

    try {
      const deadlineDate = new Date(deadline);
      const daysUntil = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      const motivation: ScheduledNotification = {
        scheduledAt: new Date(),
        message: `🎯 Dream created: "${title}". ${daysUntil} days to make it happen!`,
        type: 'MOTIVATIONAL',
      };

      await notificationService.createNotification(
        userId,
        dreamId,
        null,
        motivation
      );

      await logger.info('event', 'Dream created: motivational notification sent', {
        dreamId,
        userId,
      });
    } catch (error: any) {
      await logger.error('event', 'Failed to handle dream.created', {
        error: error.message,
        dreamId,
      });
    }
  }

  /**
   * Handle dream.completed event
   * Send success notification
   */
  private async handleDreamCompleted(event: DomainEvent): Promise<void> {
    const { dreamId, userId } = event.payload as {
      dreamId: string;
      userId: string;
    };

    try {
      const success: ScheduledNotification = {
        scheduledAt: new Date(),
        message: '🎉 Congratulations! You completed your dream!',
        type: 'MOTIVATIONAL',
      };

      await notificationService.createNotification(
        userId,
        dreamId,
        null,
        success
      );

      await logger.info('event', 'Dream completed: success notification sent', {
        dreamId,
        userId,
      });
    } catch (error: any) {
      await logger.error('event', 'Failed to handle dream.completed', {
        error: error.message,
        dreamId,
      });
    }
  }
}

export const eventHandlers = new EventHandlers();