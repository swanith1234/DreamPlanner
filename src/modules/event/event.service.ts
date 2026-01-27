import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { DomainEventType, DomainEventPayload } from './event.types';
import { EventStatus } from '@prisma/client';

export class EventService {
  async publishEvent(
    eventType: DomainEventType,
    payload: DomainEventPayload
  ): Promise<void> {
    try {
      await prisma.domainEvent.create({
        data: {
          eventType,
          payload,
          status: EventStatus.PENDING,
        },
      });

      await logger.info('event', `Event published: ${eventType}`, { payload });
    } catch (error: any) {
      await logger.error('event', `Failed to publish event: ${eventType}`, {
        error: error.message,
      });
    }
  }

  async getUnprocessedEvents() {
    return prisma.domainEvent.findMany({
      where: { status: EventStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 100, // Process in batches
    });
  }

  async markEventProcessed(eventId: string): Promise<void> {
    await prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: EventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
  }

  async markEventFailed(eventId: string, error: string): Promise<void> {
    await prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: EventStatus.FAILED,
      },
    });

    await logger.error('event', `Event processing failed: ${eventId}`, {
      error,
    });
  }
}

export const eventService = new EventService();