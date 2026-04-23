export interface CreateTaskRequest {
  dreamId: string;
  skillId?: string; // Optional: link to a specific skill in roadmap
  milestoneId?: string; // Optional: link to a specific milestone in roadmap
  title: string;
  description?: string;
  startDate?: string; // ISO date
  deadline: string; // ISO date
  estimatedDuration?: number; // minutes
  priority: number; // 1-5
  checkpoints?: CheckpointDto[];
}

export interface CheckpointDto {
  title: string;
  targetDate: string; // ISO date
  orderIndex: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  startDate?: string;
  deadline?: string;
  estimatedDuration?: number;
  priority?: number;
  status?: string;
}