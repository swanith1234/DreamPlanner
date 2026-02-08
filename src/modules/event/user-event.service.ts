import prisma from '../../config/database';
import { UserEventType } from '@prisma/client';
import { logger } from '../../utils/logger';

export class UserEventService {
    async logEvent(
        userId: string,
        eventType: UserEventType,
        entityType: 'TASK' | 'CHECKPOINT' | 'NOTIFICATION',
        entityId: string,
        metadata?: any
    ): Promise<void> {
        try {
            await prisma.userEvent.create({
                data: {
                    userId,
                    eventType,
                    entityType,
                    entityId,
                    metadata: metadata || {},
                },
            });
            // We don't necessarily need to log every user event to app logs to avoid noise, 
            // but for debugging phase it might be useful.
            // await logger.info('analytics', `UserEvent: ${eventType}`, { userId, entityId });
        } catch (error: any) {
            // Analytics should not break the app flow, so catch and log error
            await logger.error('analytics', `Failed to log user event: ${eventType}`, {
                userId,
                error: error.message,
            });
        }
    }
}

export const userEventService = new UserEventService();
