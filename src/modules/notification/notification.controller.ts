import { Response } from 'express';
import { AuthRequest } from '../../types';
import { notificationService } from './notification.service';
import { orchestrator } from '../../ai/orchestrator';
import { logger } from '../../utils/logger';

export class NotificationController {
  async list(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const notifications = await notificationService.listNotifications(
        req.userId!,
        limit,
        skip
      );
      res.status(200).json({ notifications, page, limit });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Silent action handler for push-notification action buttons / inline replies.
   * Called from: the web service worker (public/sw.js) and the native Android
   * BroadcastReceiver (TaskActionReceiver.java) — both hit this with the browser's
   * cookie jar / the WebView's CookieManager cookies, never opening the app UI.
   */
  async handleAction(req: AuthRequest, res: Response) {
    try {
      const { notificationId } = req.params;
      const { delta, text, localDate } = req.body;
      const userId = req.userId!;

      const result = await notificationService.applyPushAction(userId, notificationId, {
        delta,
        text,
        localDate,
      });

      if (result.status === 'needsChat' && result.text) {
        // Not a numeric progress update — let the AI agent handle it like any other
        // chat message (same orchestrator entrypoint POST /api/chat uses).
        const token = req.cookies?.accessToken || '';
        orchestrator
          .process({ userId, message: result.text, token })
          .catch((err: any) =>
            logger.error('notification', 'Failed to forward push reply to orchestrator', {
              error: err.message,
              userId,
            })
          );
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}

export const notificationController = new NotificationController();