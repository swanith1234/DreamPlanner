// src/ai/contextBuilder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Assembles the user context object injected into every LLM prompt.
// Tier 1 (always) is cached in Redis for 5 minutes to avoid hammering the DB.
// Tier 2 = last 8 messages (from chat:history:{userId}).
// Tier 3 = dynamic, intent-specific queries (not cached).
// ─────────────────────────────────────────────────────────────────────────────

import Redis from 'ioredis';
import { env } from '../config/env';
import { userApi } from '../apiAdapter/userApi';
import { dreamApi } from '../apiAdapter/dreamApi';
import { analyticsApi } from '../apiAdapter/analyticsApi';
import { taskApi } from '../apiAdapter/taskApi';

// Safe initialization to prevent Upstash limit crash
let redis: Redis | any = { get: async () => null, set: async () => null, del: async () => null };

try {
    const rawRedis = new Redis(env.redis.url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null // do not auto reconnect 
    });
    rawRedis.on('error', () => { /* Suppress error explicitly without logging to prevent crash loop */ });
    redis = rawRedis;
} catch (e) {
    // Fallback to fake client
}

const CTX_TTL_SECONDS = 300;    // 5 minutes
const HISTORY_TTL_SECONDS = 1800; // 30 minutes
const MAX_HISTORY_MESSAGES = 8;

function ctxKey(userId: string) { return `chat:ctx:${userId}`; }
function historyKey(userId: string) { return `chat:history:${userId}`; }

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface UserContext {
    userName: string;
    motivationTone: string;
    activeDreams: { id: string; title: string }[];
    currentWeek: {
        disciplineScore: number;
        consistencyScore: number;
        behavioralState: string;
    } | null;
    activeCheckpoints: any[];
    history: ChatMessage[];
}

export const contextBuilder = {

    // ── Build full context for a message ─────────────────────────────────────

    async build(userId: string, token: string): Promise<UserContext> {
        const [tier1, history] = await Promise.all([
            contextBuilder._getTier1(userId, token),
            contextBuilder.getHistory(userId),
        ]);
        return { ...tier1, history };
    },

    // ── Tier 1: cached snapshot ───────────────────────────────────────────────

    async _getTier1(userId: string, token: string) {
        let cached: string | null = null;
        try { cached = await redis.get(ctxKey(userId)); } catch { /* Redis unavailable */ }
        if (cached) {
            try { return JSON.parse(cached); } catch { /* fall through */ }
        }

        // Fetch in parallel — failures are soft (return nulls, not crashes)
        // NOTE: No status filter on dreams — we want ALL active/confirmed/draft dreams,
        //       not just finalized ones (user may have newly created dreams).
        const [prefsResult, dreamsResult, dashboardResult, tasksResult] =
            await Promise.allSettled([
                userApi.getPreferences(token),
                dreamApi.listDreams(token),           // No status filter: include DRAFT, CONFIRMED, ACTIVE
                analyticsApi.getDashboard(token),
                taskApi.listTasks(token, undefined, 'IN_PROGRESS'),
            ]);

        const prefs = prefsResult.status === 'fulfilled' ? prefsResult.value : null;
        const dreamsData = dreamsResult.status === 'fulfilled' ? dreamsResult.value : null;
        const dashboard = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
        const tasksData = tasksResult.status === 'fulfilled' ? tasksResult.value : null;

        // Resolve userName from preferences (name is on the User model, not prefs)
        // We store it in preferences response via the API — fall back gracefully
        const userName = prefs?.name || 'there';
        const motivationTone = prefs?.motivationTone || 'NEUTRAL';

        const activeDreams: { id: string; title: string }[] = Array.isArray(dreamsData?.dreams)
            ? dreamsData.dreams.map((d: any) => ({ id: d.id, title: d.title }))
            : [];

        const currentWeek = dashboard
            ? {
                disciplineScore: dashboard.disciplineScore ?? 0,
                consistencyScore: dashboard.consistencyScore ?? 0,
                behavioralState: dashboard.behavioralState ?? 'STABLE',
            }
            : null;

        // Active checkpoints = all IN_PROGRESS tasks with their checkpoint arrays
        const activeCheckpoints: any[] = [];
        const tasks = tasksData?.tasks ?? [];
        for (const task of tasks) {
            if (Array.isArray(task.checkpoints)) {
                const active = task.checkpoints.find((cp: any) => cp.isActive);
                if (active) {
                    activeCheckpoints.push({
                        taskId: task.id,
                        taskTitle: task.title,
                        checkpointId: active.id,
                        checkpointTitle: active.title,
                        progress: active.progress,
                        targetDate: active.targetDate,
                    });
                }
            }
        }

        const snapshot = { userName, motivationTone, activeDreams, currentWeek, activeCheckpoints };

        // ⚠️ Only cache if we actually got real data (prefs resolved and user name found).
        // This prevents caching the "0 dreams" result when the JWT cookie hadn't reached
        // the backend yet (unauthenticated API calls return empty arrays).
        const hasRealData = prefsResult.status === 'fulfilled' && !!prefs;
        if (hasRealData) {
            try {
                await redis.set(ctxKey(userId), JSON.stringify(snapshot), 'EX', CTX_TTL_SECONDS);
            } catch { /* Redis unavailable — continue without caching */ }
        }
        return snapshot;
    },

    // ── Chat history ──────────────────────────────────────────────────────────

    async getHistory(userId: string): Promise<ChatMessage[]> {
        let raw: string | null = null;
        try { raw = await redis.get(historyKey(userId)); } catch { /* Redis unavailable */ }
        if (!raw) return [];
        try { return JSON.parse(raw) as ChatMessage[]; } catch { return []; }
    },

    async appendHistory(userId: string, message: ChatMessage): Promise<void> {
        const history = await contextBuilder.getHistory(userId);
        history.push(message);
        const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
        try {
            await redis.set(historyKey(userId), JSON.stringify(trimmed), 'EX', HISTORY_TTL_SECONDS);
        } catch { /* Redis unavailable — history not persisted for this turn */ }
    },

    // ── Invalidate tier 1 cache after a write operation ───────────────────────

    async invalidateContextCache(userId: string): Promise<void> {
        try { await redis.del(ctxKey(userId)); } catch { /* Redis unavailable */ }
    },
};
