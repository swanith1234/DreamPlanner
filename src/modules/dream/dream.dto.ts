export interface CreateDreamRequest {
  title: string;
  description: string;
  domain?: string;
  targetGoal?: string;
  currentSkillLevel?: string;
  motivationStatement?: string;
  deadline: string; // ISO date
  impactScore?: number; // 1-10
  additionalContext?: string;
}

export interface SyncDreamStateRequest {
  title?: string | null;
  domain?: string | null;
  targetGoal?: string | null;
  currentSkillLevel?: string | null;
  motivationStatement?: string | null;
  deadline?: string | null;
  impactScore?: number | null;
  additionalContext?: string | null;
  confirmed?: boolean | null; // Final confirmation flag
}

export interface SyncDreamStateResponse {
  status: 'INCOMPLETE' | 'INVALID' | 'PENDING_CONFIRMATION' | 'COMPLETE';
  missingFields?: string[];
  collected?: Record<string, any>;
  dreamId?: string;
  roadmap?: any;
  reason?: string; // Human-readable feedback
  warnings?: string[]; // Quality check warnings
  suggestedCheckpoints?: any[]; // For PENDING_CONFIRMATION
  systemInstruction: string;
}

export interface UpdateDreamRequest {
  title?: string;
  description?: string;
  motivationStatement?: string;
  deadline?: string;
  impactScore?: number;
}

export interface ConfirmDreamRequest {
  checkpoints: {
    id?: string;
    title: string;
    description?: string;
    expectedEffort?: number;
    miniDeadline?: string;
    orderIndex: number;
  }[];
}