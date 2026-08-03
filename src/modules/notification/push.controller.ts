import { Request, Response } from 'express';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';

export class PushController {

    async subscribe(req: Request, res: Response) {
        try {
            // @ts-ignore
            const userId = req.userId; // Auth middleware adds this
            const subscription = req.body;

            if (!subscription || !subscription.endpoint || !subscription.keys) {
                return res.status(400).json({ error: 'Invalid subscription object' });
            }

            await prisma.pushSubscription.upsert({
                where: { endpoint: subscription.endpoint },
                update: {
                    userId,
                    auth: subscription.keys.auth,
                    p256dh: subscription.keys.p256dh,
                    userAgent: req.headers['user-agent']
                },
                create: {
                    userId,
                    endpoint: subscription.endpoint,
                    auth: subscription.keys.auth,
                    p256dh: subscription.keys.p256dh,
                    userAgent: req.headers['user-agent']
                }
            });

            await logger.info('notification', 'Push subscription added', {}, userId);
            res.status(201).json({ success: true });
        } catch (error: any) {
            await logger.error('notification', 'Failed to subscribe to push', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    }

    async unsubscribe(req: Request, res: Response) {
        try {
            // @ts-ignore
            const userId = req.userId;
            const { endpoint } = req.body;
            if (!endpoint) {
                return res.status(400).json({ error: 'Endpoint required' });
            }

            // Scope the delete to the caller. Deleting by `endpoint` alone let any
            // authenticated user silently disable another user's push delivery.
            await prisma.pushSubscription.deleteMany({
                where: { endpoint, userId }
            });

            await logger.info('notification', 'Push subscription removed', {}, userId);
            res.json({ success: true });
        } catch (error: any) {
            await logger.error('notification', 'Failed to unsubscribe push', { error: error.message });
            res.status(500).json({ error: error.message });
        }
    }

    async checkSubscription(req: Request, res: Response) {
        try {
            // @ts-ignore
            const userId = req.userId;
            const { endpoint } = req.body;
            if (!endpoint) {
                return res.json({ subscribed: false });
            }

            // Scoped to the caller so this cannot be used to probe whether an
            // arbitrary endpoint/FCM token is registered to someone else.
            const subscription = await prisma.pushSubscription.findFirst({
                where: { endpoint, userId }
            });

            res.json({ subscribed: !!subscription });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getVapidKey(req: Request, res: Response) {
        // Return public key so frontend can use it
        res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
    }
}

export const pushController = new PushController();
