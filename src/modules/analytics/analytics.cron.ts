import { startOfDay } from 'date-fns';
import cron from 'node-cron';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { analyticsService } from './analytics.service';
import { userEventService } from '../event/user-event.service';
import { UserEventType } from '@prisma/client';

export class AnalyticsCron {
    init() {
        // Weekly Job: Sunday 23:55
        cron.schedule('55 23 * * 0', async () => {
            logger.info('cron', 'Starting weekly analytics snapshot generation');
            await this.runWeeklySnapshots();
        });

        // Daily Job: 23:55
        cron.schedule('55 23 * * *', async () => {
            logger.info('cron', 'Starting daily activity check');
            await this.runDailyActivityCheck();
        });

        logger.info('cron', 'Analytics cron jobs initialized');
    }

    async runWeeklySnapshots() {
        try {
            const users = await prisma.user.findMany({ select: { id: true } });
            for (const user of users) {
                await analyticsService.generateWeeklySnapshot(user.id);
            }
        } catch (error: any) {
            logger.error('cron', 'Error running weekly snapshots', { error: error.message });
        }
    }

    async runDailyActivityCheck() {
        try {
            const now = new Date();
            const start = startOfDay(now);

            const users = await prisma.user.findMany({ select: { id: true } });

            for (const user of users) {
                const hasActivity = await prisma.userEvent.findFirst({
                    where: {
                        userId: user.id,
                        createdAt: { gte: start }
                    }
                });

                if (!hasActivity) {
                    await userEventService.logEvent(user.id, UserEventType.DAY_WITH_NO_ACTIVITY, 'NOTIFICATION', 'system', { date: start });
                }
            }
        } catch (error: any) {
            logger.error('cron', 'Error running daily activity check', { error: error.message });
        }
    }
}

export const analyticsCron = new AnalyticsCron();
