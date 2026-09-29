import api from './client';

// ── Sprint Dashboard (live, computed per request) ─────────────────────────────
export interface CheckpointItem {
    id: string;
    title: string;
    targetDate: string;
    isCompleted: boolean;
    progress: number;
    completedAt?: string | null;
}

export interface SprintDashboard {
    sprintWindow: { start: string; end: string };
    checkpoints: {
        planned: { count: number; items: CheckpointItem[] };
        earlyCompleted: { count: number; items: CheckpointItem[] };
        onTimeCompleted: { count: number; items: CheckpointItem[] };
        recovered: { count: number; items: CheckpointItem[] };
        overduePending: { count: number; items: CheckpointItem[] };
    };
    rates: {
        executionRate: number;
        recoveryRate: number;
    };
    activity: {
        activeDays: number;
        missedDays: number;
        overachievementDays: number;
        totalEffort: number;
        dailyEffort: Record<string, number>; // { "2026-02-16": 80, ... }
    };
    scores: {
        consistency: number;
        intensity: number;
        disciplineScore: number;
    };
}

// Legacy type kept for compat (weekly cron snapshot endpoint)
export interface WeeklyInsightResponse {
    snapshot: {
        weekStart: string;
        disciplineScore: number;
        consistencyScore: number;
        totalCheckpointsCompleted: number;
        totalCheckpointsPlanned: number;
        activeDays: number;
        lateCheckpoints: number;
        earlyStarts: number;
        dailyEffort: Record<string, number>;
    } | null;
    insight: { insightType: string; evidence: any } | null;
}

export interface SprintSummary {
    id: string;
    weekStart: string;
    weekEnd: string;
    disciplineScore: number;
    executionRate: number;
    recoveryRate: number;
    totalCheckpointsPlanned: number;
    totalCheckpointsCompleted: number;
}

export const analyticsApi = {
    // Live sprint dashboard (main endpoint)
    getWeeklyDashboard: async (date?: string): Promise<SprintDashboard> => {
        const params = date ? { date } : {};
        const response = await api.get('/analytics/dashboard', { params });
        return response.data;
    },

    // List finalized sprints
    listSprints: async (): Promise<SprintSummary[]> => {
        const response = await api.get('/analytics/sprints');
        return response.data;
    },

    // Get specific stored snapshot
    getSprintByWeekStart: async (weekStart: string): Promise<any> => {
        const response = await api.get(`/analytics/sprint/${weekStart}`);
        return response.data;
    },

    // Dev-only: manually trigger snapshot finalization
    triggerGeneration: async () => api.post('/analytics/generate'),
};
