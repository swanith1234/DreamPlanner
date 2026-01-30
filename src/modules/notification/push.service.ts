import webpush from 'web-push';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

export class PushService {
    constructor() {
        // Ideally these should be in env config file and passed here, but reading process.env is fine for now
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;

        if (publicKey && privateKey) {
            webpush.setVapidDetails(
                `mailto:${process.env.EMAIL_FROM || 'test@example.com'}`,
                publicKey,
                privateKey
            );
        } else {
            logger.warn('notification', 'VAPID keys not found. Push notifications will not work.');
        }
    }

    /**
     * Send a push notification to all of a user's subscriptions
     */
    async sendPushNotification(userId: string, payload: any) {
        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId },
            });

            if (subscriptions.length === 0) return;

            const notificationPayload = JSON.stringify(payload);

            const promises = subscriptions.map(async (sub) => {
                try {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            auth: sub.auth,
                            p256dh: sub.p256dh,
                        },
                    };

                    await webpush.sendNotification(pushSubscription, notificationPayload);
                } catch (error: any) {
                    if (error.statusCode === 410 || error.statusCode === 404) {
                        // Subscription is gone, delete it
                        await prisma.pushSubscription.delete({ where: { id: sub.id } });
                    } else {
                        logger.error('notification', 'Failed to send push to subscription', { error: error.message, subId: sub.id });
                    }
                }
            });

            await Promise.all(promises);

            await logger.info('notification', `Push notification sent to ${subscriptions.length} devices`, { userId });

        } catch (error: any) {
            logger.error('notification', 'Failed to send push notification', { error: error.message, userId });
        }
    }
}

export const pushService = new PushService();
