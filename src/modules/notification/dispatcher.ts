// src/modules/notification/dispatcher.ts
import { NotificationType, Notification, User } from '@prisma/client';
import { emailProvider } from './providers/email.provider';
import { logger } from '../../utils/logger';

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

      // Web Push (stub)
      // const webResult = await this.dispatchWebPush(data);
      // if (!webResult.success && webResult.error) {
      //   errors.push(`Web Push: ${webResult.error}`);
      // }

      // App Notification (stub)
      // const appResult = await this.dispatchAppNotification(data);
      // if (!appResult.success && appResult.error) {
      //   errors.push(`App: ${appResult.error}`);
      // }

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
   * Dispatch via web push (stub)
   */
  private async dispatchWebPush(
    data: NotificationData
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement web push
    // Options: Firebase, OneSignal, Expo, etc.
    return { success: true };
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