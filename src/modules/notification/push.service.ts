import webpush from 'web-push';
import * as admin from 'firebase-admin';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';

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
                    // Native FCM token (Android app via Capacitor)
                    if (sub.p256dh === 'NATIVE' || sub.auth === 'NATIVE' || !sub.p256dh) {
                        await logger.info('notification', `[FCM] Sending data-only message to native device`, {
                            subId: sub.id,
                            token: sub.endpoint.substring(0, 15) + '...'
                        });

                        // ─── DATA-ONLY FCM ───────────────────────────────────────────────
                        // We deliberately omit the top-level `notification` block.
                        // This means FCM will NOT auto-display a system notification.
                        // Instead, our MyFirebaseMessagingService.java receives the data
                        // payload via onMessageReceived() and builds a rich local notification
                        // with action buttons and RemoteInput (inline reply).
                        //
                        // BUG FIX: The previous `clickAction: 'inline_reply'` in
                        // android.notification caused Android to look for an intent-filter
                        // named 'inline_reply' — which doesn't exist — so clicking the
                        // notification body silently dismissed the app instead of opening it.
                        // ────────────────────────────────────────────────────────────────

                        // All data values MUST be strings for FCM.
                        // Skip null/undefined rather than stringifying them — otherwise
                        // an absent taskId arrives on the device as the literal
                        // "undefined", which passes the receiver's non-empty checks and
                        // gets POSTed back as a bogus id.
                        const stringData: Record<string, string> = {};
                        if (payload.data) {
                            for (const [key, val] of Object.entries(payload.data)) {
                                if (val === null || val === undefined) continue;
                                stringData[key] = String(val);
                            }
                        }

                        // Core notification content — passed to MyFirebaseMessagingService
                        stringData.title    = payload.title  || 'IgniteMate';
                        stringData.body     = payload.body   || '';
                        stringData.icon     = payload.icon   || '';
                        stringData.tag      = stringData.notificationId || userId;

                        // Actions JSON — parsed by MyFirebaseMessagingService to build buttons
                        // Android shows at most 3 notification actions, and the inline
                        // Reply action already occupies one slot — so ship 2 progress
                        // buttons, not 3, or the last one is silently dropped.
                        //
                        // Values are DELTAS applied to the active checkpoint.
                        // "Complete" sends 100, which clamps to 100 and is therefore
                        // safe to tap repeatedly.
                        if (payload.actions && payload.actions.length > 0) {
                            stringData.actions = JSON.stringify(payload.actions.slice(0, 2));
                        } else {
                            stringData.actions = JSON.stringify([
                                { label: '+10%',     actionType: 'PROGRESS', value: '10'  },
                                { label: 'Complete', actionType: 'PROGRESS', value: '100' },
                            ]);
                        }

                        // Auth token so the BroadcastReceiver can call the backend
                        // We store it in shared prefs on the device — send it here so the
                        // service can cache it.
                        stringData.apiUrl = process.env.API_URL || 'https://your-render-url.onrender.com';

                        const fcmMessage: admin.messaging.Message = {
                            token: sub.endpoint,
                            // No `notification` block → data-only, handled by our service
                            data: stringData,
                            android: {
                                priority: 'high', // Required for data-only to wake up the device
                            },
                            apns: {
                                headers: {
                                    'apns-priority': '10',
                                },
                                payload: {
                                    aps: {
                                        contentAvailable: true,
                                        category: 'PROGRESS_ACTIONS',
                                    }
                                }
                            }
                        };

                        const response = await admin.messaging().send(fcmMessage);
                        await logger.info('notification', `[FCM] Data-only send success`, { response });

                    } else {
                        // Standard Web Push (browser)
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
                    // Clean up stale tokens
                    if (
                        error.statusCode === 410 ||
                        error.statusCode === 404 ||
                        error.code === 'messaging/registration-token-not-registered'
                    ) {
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
