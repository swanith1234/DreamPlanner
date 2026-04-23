import { Request, Response } from 'express';
import { pushService } from './push.service';
import { logger } from '../../utils/logger';

export const testPushHandler = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.userId;
        const { title, body } = req.body;

        await logger.info('notification', 'Triggering manual test push', { userId });

        await pushService.sendPushNotification(userId, {
            title: title || 'Test Notification',
            body: body || 'This is a manual test push from IgniteMate.',
            data: { url: '/app/home', test: true }
        });

        res.json({ success: true, message: 'Test push triggered. Check your device.' });
    } catch (error: any) {
        await logger.error('notification', 'Test push failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
};
