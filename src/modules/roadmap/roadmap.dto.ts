export type RoadmapNodeStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVISION_REQUIRED';

export type DifficultyLevel =
  | 'BASIC'
  | 'PRACTICE'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'MASTERY';

export interface GenerateRoadmapRequest {
  dreamId: string;
}

export interface RoadmapDraftPayload {
  generationPromptVersion?: string;
  milestones: Array<{
    id?: string;
    orderIndex: number;
    startDate?: string | null; // YYYY-MM-DD
    endDate?: string | null; // YYYY-MM-DD
    title: string;
    description?: string | null;
    completionCriteria: any;
    confidence?: number;
    estimatedMinutes?: number | null;
    difficulty?: DifficultyLevel | null;
    difficultyLevel?: number;
    status?: RoadmapNodeStatus;
    targetUserState?: string;
    parentIds?: string[];
  }>;
}

export interface UpdateRoadmapRequest {
  roadmapId: string;
  draft: RoadmapDraftPayload;
}

