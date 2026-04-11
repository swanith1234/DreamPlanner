import webpush from 'web-push';
import * as admin from 'firebase-admin';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

// Initialize Firebase Admin gracefully
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            let serviceAccount;
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            } catch (e) {
                // If it's a file path string
                serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);
            }
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            logger.info('notification', 'Firebase Admin Initialized Successfully');
        } else {
            logger.warn('notification', 'FIREBASE_SERVICE_ACCOUNT not found. FCM Native Push will fail.');
            // Initialize empty app to avoid immediate runtime crashes if called without credentials
            admin.initializeApp();
        }
    } catch (e: any) {
        logger.error('notification', 'Failed to initialize Firebase Admin', { error: e.message });
    }
}

export class PushService {
    constructor() {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;

        if (publicKey && privateKey) {
            webpush.setVapidDetails(
                `mailto:${process.env.EMAIL_FROM || 'test@example.com'}`,
                publicKey,
                privateKey
            );
        } else {
            logger.warn('notification', 'VAPID keys not found. Web Push notifications will not work.');
        }
    }

    async sendPushNotification(userId: string, payload: any) {
        try {
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId },
            });

            if (subscriptions.length === 0) return;

            const promises = subscriptions.map(async (sub) => {
                try {
                    // Check if Native FCM Token via our mock key payload
                    if (sub.p256dh === 'NATIVE' || sub.auth === 'NATIVE' || !sub.p256dh) {
                        await logger.info('notification', `[FCM] Sending to native device`, { subId: sub.id, token: sub.endpoint.substring(0, 10) + '...' });
                        
                        // FCM data values MUST all be strings
                        const stringData: Record<string, string> = {};
                        if (payload.data) {
                            for (const [key, val] of Object.entries(payload.data)) {
                                stringData[key] = String(val);
                            }
                        }
                        stringData.actionId = 'inline_reply';
                        stringData.click_action = 'inline_reply';
                        stringData.title = payload.title || "IgniteMate";
                        stringData.body = payload.body || "New message";

                        const fcmMessage: admin.messaging.Message = {
                            token: sub.endpoint,
                            data: stringData,
                            apns: {
                                payload: {
                                    aps: {
                                        alert: {
                                            title: payload.title || "IgniteMate",
                                            body: payload.body || "New message"
                                        },
                                        category: 'inline_reply'
                                    }
                                }
                            }
                        };
                        
                        const response = await admin.messaging().send(fcmMessage);
                        await logger.info('notification', `[FCM] Send success`, { response });
                    } else {
                        // Standard Web Push
                        const notificationPayload = JSON.stringify(payload);
                        const pushSubscription = {
                            endpoint: sub.endpoint,
                            keys: {
                                auth: sub.auth,
                                p256dh: sub.p256dh,
                            },
                        };

                        await webpush.sendNotification(pushSubscription, notificationPayload);
                    }
                } catch (error: any) {
                    await logger.error('notification', `[PUSH FAIL] type=${sub.p256dh === 'NATIVE' ? 'FCM' : 'WebPush'}`, { 
                        error: error.message, 
                        code: error.code,
                        subId: sub.id 
                    });
                    if (error.statusCode === 410 || error.statusCode === 404 || error.code === 'messaging/registration-token-not-registered') {
                        await prisma.pushSubscription.delete({ where: { id: sub.id } });
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
