// src/modules/notification/dispatcher.ts
import { NotificationType, Notification, User } from '@prisma/client';
import { emailProvider } from './providers/email.provider';
import { logger } from '../../utils/logger';
import { notificationWS } from './websocket.server';
import { pushService } from './push.service';

export interface NotificationData {
  notification: Notification;
  user: User;
  task?: any;
  dream?: any;
}

/**
 * Extensible notification dispatcher
 * Supports multiple channels: Email, Web Push, App Notifications, etc.
 */
export class NotificationDispatcher {
  /**
   * Dispatch notification to all configured channels
   */
  async dispatch(data: NotificationData): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Email dispatch (currently implemented)
      const emailResult = await this.dispatchEmail(data);
      if (!emailResult.success && emailResult.error) {
        errors.push(`Email: ${emailResult.error}`);
      }

      // Web Push
      const webResult = await this.dispatchWebPush(data);
      if (!webResult.success && webResult.error) {
        errors.push(`Web Push: ${webResult.error}`);
      }

      // Real-Time WebSocket Notification
      await this.dispatchRealTime(data);

      return {
        success: errors.length === 0,
        errors,
      };
    } catch (error: any) {
      await logger.error('dispatcher', 'Failed to dispatch notification', {
        error: error.message,
        notificationId: data.notification.id,
      });
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Dispatch via email
   */
  private async dispatchEmail(
    data: NotificationData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { notification, user, task, dream } = data;

      if (!user.email) {
        return {
          success: false,
          error: 'User email not found',
        };
      }

      const result = await emailProvider.send({
        to: user.email,
        userName: user.name || user.email,
        taskTitle: task?.title,
        dreamTitle: dream?.title,
        message: notification.message,
        scheduledAt: notification.scheduledAt,
        userTimezone: user.timezone,
        notificationType: notification.type,
      });

      return {
        success: result.success,
        error: result.error,
      };
    } catch (error: any) {
      await logger.error('dispatcher', 'Email dispatch failed', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Dispatch via web push
   */
  private async dispatchWebPush(
    data: NotificationData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { notification, user, task } = data;

      await pushService.sendPushNotification(user.id, {
        title: 'DreamPlanner',
        body: notification.message,
        icon: '/pwa-192x192.png',
        data: {
          url: task ? `/app/tasks/${task.id}` : '/app/home',
          notificationId: notification.id
        }
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Dispatch via WebSocket (Real-Time)
   */
  private async dispatchRealTime(data: NotificationData): Promise<void> {
    try {
      const { notification, user } = data;

      // Broadcast to user's connected clients
      notificationWS.sendToUser(user.id, {
        type: 'NOTIFICATION_NEW',
        notification: {
          ...notification,
          // Ensure date strings are sent as strings
          scheduledAt: notification.scheduledAt.toISOString(),
          createdAt: notification.createdAt.toISOString()
        }
      });

    } catch (error) {
      // Logging only, don't block other dispatchers
      console.error('WebSocket dispatch failed', error);
    }
  }

  /**
   * Dispatch via app notification (stub)
   */
  private async dispatchAppNotification(
    data: NotificationData
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement app notifications
    // Store in app notification table for in-app display
    return { success: true };
  }
}

export const notificationDispatcher = new NotificationDispatcher();