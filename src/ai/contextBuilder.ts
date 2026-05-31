// src/ai/contextBuilder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds a personalized CONTEXT block injected into the system prompt.
// Results are cached in Redis for 2 minutes per user to avoid redundant
// API calls on every chat message (4 HTTP calls → 0 on cache hit).
//
// Fetched data:
//   • User name + motivation tone
//   • Active / draft dreams (up to 4)
//   • PENDING / IN_PROGRESS tasks (up to 5, with their active checkpoint)
//   • Current week dashboard analytics (discipline score, state, consistency)
// ─────────────────────────────────────────────────────────────────────────────

import { userApi } from '../apiAdapter/userApi';
import { dreamApi } from '../apiAdapter/dreamApi';
import { taskApi } from '../apiAdapter/taskApi';
import { analyticsApi } from '../apiAdapter/analyticsApi';
import { roadmapApi } from '../apiAdapter/roadmapApi';
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { env } from '../config/env';

// ── Redis client (graceful no-op if unavailable) ─────────────────────────────

const CONTEXT_TTL = 30; // seconds — 30 seconds (short to minimize stale data)

let redis: any = {
    get: async () => null,
    set: async () => null,
    del: async () => null,
};
try {
    const rawRedis = new Redis(env.redis.url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
    });
    rawRedis.on('error', () => { /* suppress */ });
    redis = rawRedis;
} catch { /* fallback to mock */ }

function contextCacheKey(userId: string) {
    return `ctx:${userId}`;
}

export interface UserContext {
    name: string;
    preferredName?: string;
    agentName?: string;
    motivationTone: string;
    contextBlock: string; // Injected into system prompt
}

/** Truncate a string to max N chars for compact injection. */
function trunc(s: string | undefined | null, max = 60): string {
    if (!s) return '';
    return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Format a date as "MMM DD YYYY" for human readability. */
function fmtDate(d: string | Date | undefined): string {
    if (!d) return 'no deadline';
    try {
        return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return String(d).slice(0, 10);
    }
}

export async function buildUserContext(token: string, userId: string): Promise<UserContext> {

    // ── Cache-first: return early if we have a fresh context ─────────────────
    try {
        const cached = await redis.get(contextCacheKey(userId));
        if (cached) {
            await logger.info('context-builder', `[CACHE HIT] userId=${userId.slice(0, 8)}`, {});
            return JSON.parse(cached) as UserContext;
        }
    } catch { /* Redis unavailable, continue */ }

    // ── Parallel fetch (Identity + Snapshot of Reality) ───────────────────────
    const [prefs, dreams, tasks] = await Promise.allSettled([
        userApi.getPreferences(token),
        dreamApi.listDreams(token, 'ACTIVE'),
        taskApi.listTasks(token, undefined, 'PENDING'),
    ]);

    // ── Extract data ─────────────────────────────────────────────────────────
    const prefsData = prefs.status === 'fulfilled' ? prefs.value : null;
    const dreamsData = dreams.status === 'fulfilled' ? dreams.value : [];
    const tasksData = tasks.status === 'fulfilled' ? tasks.value : [];

    const name: string = prefsData?.name || prefsData?.user?.name || 'there';
    const preferredName: string = prefsData?.preferredName || name;
    const agentName: string = prefsData?.agentName || `Future ${name}`;
    const motivationTone: string = prefsData?.motivationTone || 'NEUTRAL';

    // ── Format Reality Snapshot ──────────────────────────────────────────────
    const dreamSnapshot = Array.isArray(dreamsData) && dreamsData.length > 0 
        ? dreamsData.slice(0, 3).map((d: any) => `• ${d.title} (ID: ${d.id.slice(0,8)})`).join('\n')
        : 'No active dreams.';

    const taskSnapshot = Array.isArray(tasksData) && tasksData.length > 0
        ? tasksData.slice(0, 3).map((t: any) => `• ${t.title} [${t.status}]`).join('\n')
        : 'No pending tasks.';

    // ── Build the ultra-lean context block ────────────────────────────────────
    const contextBlock = `
USER_IDENTITY:
You ARE: ${agentName}
Address user as: ${preferredName}
Tone: ${motivationTone}
Date: ${new Date().toLocaleDateString('en-IN')}

ACTIVE_DREAMS:
${dreamSnapshot}

PENDING_TASKS:
${taskSnapshot}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    await logger.info('context-builder', `[CONTEXT REBUILT] Snapshot for ${name}`, { 
        dreams: Array.isArray(dreamsData) ? dreamsData.length : 0,
        tasks: Array.isArray(tasksData) ? tasksData.length : 0
    });

    const result: UserContext = { name, preferredName, agentName, motivationTone, contextBlock };

    // ── Cache the result for 30 seconds ───────────────────────────────────────
    try {
        await redis.set(contextCacheKey(userId), JSON.stringify(result), 'EX', CONTEXT_TTL);
    } catch { /* Redis unavailable */ }

    return result;
}

/**
 * Invalidate the context cache for a user.
 * Call this after any write operation (createTask, completeDream etc.) so the
 * agent picks up fresh data on the very next message.
 */
export async function invalidateContextCache(userId: string): Promise<void> {
    try {
        await redis.del(contextCacheKey(userId));
    } catch { /* Redis unavailable */ }
}
