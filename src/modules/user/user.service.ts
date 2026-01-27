import prisma from '../../config/database';
import { logger } from '../../utils/logger';

export class UserService {
    async updatePreferences(userId: string, data: any) {
        try {
            const preferences = await prisma.userPreference.upsert({
                where: { userId },
                update: {
                    motivationTone: data.motivationTone,
                    notificationFrequency: parseInt(data.notificationFrequency),
                    sleepStart: data.sleepStart,
                    sleepEnd: data.sleepEnd,
                    quietHours: data.quietHours || [],
                },
                create: {
                    userId,
                    motivationTone: data.motivationTone || 'NEUTRAL',
                    notificationFrequency: parseInt(data.notificationFrequency) || 60,
                    sleepStart: data.sleepStart || '23:00',
                    sleepEnd: data.sleepEnd || '07:00',
                    quietHours: data.quietHours || [],
                },
            });

            await logger.info('user', 'Updated user preferences', { userId });
            return preferences;
        } catch (error: any) {
            await logger.error('user', 'Failed to update preferences', { error: error.message, userId });
            throw error;
        }
    }

    async getPreferences(userId: string) {
        return prisma.userPreference.findUnique({
            where: { userId },
        });
    }
}

export const userService = new UserService();
