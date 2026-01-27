export type DomainEventType =
  | 'dream.created'
  | 'dream.completed'
  | 'dream.failed'
  | 'task.created'
  | 'task.completed'
  | 'task.progress_updated'
  | 'notification.scheduled';

export interface DomainEventPayload {
  [key: string]: any;
}