// src/ai/redisDraftManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Temporary conversational state in Redis.
// ONLY used for multi-step flows that need state between turns:
//   chat:draft:{userId}            → task/checkpoint creation wizard
//   chat:checkpointDraft:{userId}  → dream checkpoint editing
// Permanent chat history is stored in PostgreSQL (ChatMessage model).
// ─────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { env } from '../config/env';

// Safe initialization — gracefully falls back to a no-op mock if Redis is unavailable
let redis: Redis | any = {
    get: async () => null,
    set: async () => null,
    del: async () => null,
    expire: async () => null,
};

try {
    const rawRedis = new Redis(env.redis.url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // no auto-reconnect
    });
    rawRedis.on('error', () => { /* suppress */ });
    redis = rawRedis;
} catch {
    // fallback to mock
}

const DRAFT_TTL = 600; // 10 minutes

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Stores suggested checkpoints during multi-step task or dream creation flows */
export interface CheckpointDraft {
    suggestedCheckpoints: {
        title: string;
        targetDate: string;  // YYYY-MM-DD
        orderIndex: number;
        description?: string;
        expectedEffort?: number;
        miniDeadline?: string;
    }[];
    /** Task params collected so far (for CREATE_TASK wizard) */
    taskParams?: Record<string, any>;
    /** Dream ID (for CONFIRM_DREAM flow) */
    dreamId?: string;
    /** Whether this is for a task or dream */
    flowType: 'task' | 'dream';
    createdAt: number;
}

// ── Key helpers ───────────────────────────────────────────────────────────────

function draftKey(userId: string) {
    return `chat:draft:${userId}`;
}

function checkpointDraftKey(userId: string) {
    return `chat:checkpointDraft:${userId}`;
}

// ── Checkpoint Draft (multi-step wizard state) ────────────────────────────────

export const redisDraftManager = {
    // Checkpoint draft — used during task/dream creation to hold suggested steps
    async saveCheckpointDraft(userId: string, draft: CheckpointDraft): Promise<void> {
        try {
            await redis.set(checkpointDraftKey(userId), JSON.stringify(draft), 'EX', DRAFT_TTL);
        } catch { /* Redis unavailable */ }
    },

    async getCheckpointDraft(userId: string): Promise<CheckpointDraft | null> {
        try {
            const raw = await redis.get(checkpointDraftKey(userId));
            if (!raw) return null;
            return JSON.parse(raw) as CheckpointDraft;
        } catch {
            return null;
        }
    },

    async updateCheckpointDraft(userId: string, patch: Partial<CheckpointDraft>): Promise<void> {
        const existing = await redisDraftManager.getCheckpointDraft(userId);
        if (!existing) return;
        const updated = { ...existing, ...patch };
        try {
            await redis.set(checkpointDraftKey(userId), JSON.stringify(updated), 'EX', DRAFT_TTL);
        } catch { /* Redis unavailable */ }
    },

    async deleteCheckpointDraft(userId: string): Promise<void> {
        try { await redis.del(checkpointDraftKey(userId)); } catch { /* Redis unavailable */ }
    },

    // Generic draft key — reserved for any future wizard extension
    async saveDraft(userId: string, data: Record<string, any>): Promise<void> {
        try {
            await redis.set(draftKey(userId), JSON.stringify(data), 'EX', DRAFT_TTL);
        } catch { /* Redis unavailable */ }
    },

    async getDraft(userId: string): Promise<Record<string, any> | null> {
        try {
            const raw = await redis.get(draftKey(userId));
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    },

    async deleteDraft(userId: string): Promise<void> {
        try { await redis.del(draftKey(userId)); } catch { /* Redis unavailable */ }
    },
};
