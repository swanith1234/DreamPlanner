import { Response } from 'express';
import { AuthRequest } from '../../types';
import { notificationService } from './notification.service';

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
}

export const notificationController = new NotificationController();