/**
 * ANALYTICS CRON
 *
 * Sunday 23:59 — finalise and persist the week's snapshot for all users.
 * Daily   23:55 — log DAY_WITH_NO_ACTIVITY for users who had no Day records today.
 */

import cron from 'node-cron';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { analyticsService } from './analytics.service';
import { userEventService } from '../event/user-event.service';
import { UserEventType } from '@prisma/client';
import { startOfDay } from 'date-fns';

export class AnalyticsCron {
    init() {
        // Weekly snapshot — Sunday 23:59
        cron.schedule('59 23 * * 0', async () => {
            logger.info('cron', 'Starting weekly snapshot finalisation');
            await this.runWeeklySnapshots();
        });

        // Daily no-activity check — every day 23:55
        cron.schedule('55 23 * * *', async () => {
            logger.info('cron', 'Starting daily activity check');
            await this.runDailyActivityCheck();
        });

        logger.info('cron', 'Analytics cron jobs initialised');
    }

    // ── Weekly: finalise snapshot for every user ────────────────────────────
    async runWeeklySnapshots() {
        try {
            const users = await prisma.user.findMany({ select: { id: true } });
            for (const user of users) {
                await analyticsService.finalizeWeeklySnapshot(user.id);
            }
            logger.info('cron', `Weekly snapshots done for ${users.length} users`);
        } catch (error: any) {
            logger.error('cron', 'Error running weekly snapshots', { error: error.message });
        }
    }

    // ── Daily: log DAY_WITH_NO_ACTIVITY for inactive users ──────────────────
    // Uses the Day table for accuracy — no Day row for today = no effort logged.
    async runDailyActivityCheck() {
        try {
            const todayStart = startOfDay(new Date());

            const users = await prisma.user.findMany({ select: { id: true } });

            for (const user of users) {
                const hadActivity = await prisma.day.findFirst({
                    where: {
                        userId: user.id,
                        date: todayStart,
                    },
                });

                if (!hadActivity) {
                    await userEventService.logEvent(
                        user.id,
                        UserEventType.DAY_WITH_NO_ACTIVITY,
                        'NOTIFICATION',
                        'system',
                        { date: todayStart.toISOString() }
                    );
                }
            }
        } catch (error: any) {
            logger.error('cron', 'Error running daily activity check', { error: error.message });
        }
    }
}

export const analyticsCron = new AnalyticsCron();
