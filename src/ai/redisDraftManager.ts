// src/ai/redisDraftManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manages incomplete AI action drafts in Redis.
// Uses the ioredis client already wired up via queue.ts / config/env.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { env } from '../config/env';

// Safe initialization to prevent Upstash limit crash
let redis: Redis | any = { get: async () => null, set: async () => null, del: async () => null };

try {
    const rawRedis = new Redis(env.redis.url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null // do not auto reconnect 
    });
    rawRedis.on('error', () => { /* Suppress limit error */ });
    redis = rawRedis;
} catch (e) {
    // Fallback
}

const DRAFT_TTL_SECONDS = 600; // 10 minutes

export type DraftStatus =
    | 'COLLECTING_PARAMS'        // still gathering required fields
    | 'AWAITING_CHECKPOINT_CONFIRM'  // checkpoint list presented, waiting for user edit/confirm
    | 'AWAITING_CONFIRMATION'    // full summary shown, waiting for "yes"
    | 'EXECUTING';               // API call in flight (prevents double-submit)

export interface ChatDraft {
    intent: string;
    parameters: Record<string, any>;
    missingFields: string[];
    suggestedCheckpoints?: any[];
    status: DraftStatus;
    originalMessage: string;
    createdAt: number;
    // ── Context-switch abort state ────────────────────────────────────────────
    // Set when the user appears to be changing the subject while a draft is open.
    // The orchestrator will ask the user to confirm before aborting the draft.
    isAwaitingAbortConfirmation?: boolean;
    pendingContextSwitchMessage?: string;
}

function draftKey(userId: string): string {
    return `chat:draft:${userId}`;
}

export const redisDraftManager = {
    async saveDraft(userId: string, draft: ChatDraft): Promise<void> {
        try {
            await redis.set(draftKey(userId), JSON.stringify(draft), 'EX', DRAFT_TTL_SECONDS);
        } catch { /* Redis unavailable — draft not persisted */ }
    },

    async getDraft(userId: string): Promise<ChatDraft | null> {
        let raw: string | null = null;
        try { raw = await redis.get(draftKey(userId)); } catch { return null; }
        if (!raw) return null;
        try {
            return JSON.parse(raw) as ChatDraft;
        } catch {
            return null;
        }
    },

    async updateDraft(userId: string, patch: Partial<ChatDraft>): Promise<void> {
        const existing = await redisDraftManager.getDraft(userId);
        if (!existing) return;
        const updated: ChatDraft = { ...existing, ...patch };
        try {
            await redis.set(draftKey(userId), JSON.stringify(updated), 'EX', DRAFT_TTL_SECONDS);
        } catch { /* Redis unavailable */ }
    },

    async deleteDraft(userId: string): Promise<void> {
        try { await redis.del(draftKey(userId)); } catch { /* Redis unavailable */ }
    },

    async refreshTTL(userId: string): Promise<void> {
        try { await redis.expire(draftKey(userId), DRAFT_TTL_SECONDS); } catch { /* Redis unavailable */ }
    },
};
