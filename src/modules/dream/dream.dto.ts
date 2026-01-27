export interface CreateDreamRequest {
  title: string;
  description: string;
  motivationStatement?: string;
  deadline: string; // ISO date
  impactScore: number; // 1-10
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