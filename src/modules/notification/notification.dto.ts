export interface CreateNotificationRequest {
  dreamId?: string;
  taskId?: string;
  type: string;
  message: string;
  scheduledAt: string;
}
