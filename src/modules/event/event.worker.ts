import { logger } from '../../utils/logger';
import { eventService } from './event.service';
import { eventHandlers } from './event.handlers';

export class EventWorker {
  private pollInterval = 5000; // 5 seconds
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await logger.info('event', 'Event worker started');

    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    await logger.info('event', 'Event worker stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const events = await eventService.getUnprocessedEvents();

      for (const event of events) {
        try {
          await eventHandlers.handle(event);
          await eventService.markEventProcessed(event.id);
        } catch (error: any) {
          await eventService.markEventFailed(event.id, error.message);
        }
      }
    } catch (error: any) {
      await logger.error('event', 'Event worker poll failed', {
        error: error.message,
      });
    }

    // Schedule next poll
    setTimeout(() => this.poll(), this.pollInterval);
  }
}

export const eventWorker = new EventWorker();