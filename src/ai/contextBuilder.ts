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
import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { env } from '../config/env';

// ── Redis client (graceful no-op if unavailable) ─────────────────────────────

const CONTEXT_TTL = 120; // seconds — 2 minutes

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

    // ── Parallel fetch ────────────────────────────────────────────────────────
    const [prefs, dreams, tasks, dashboard] = await Promise.allSettled([
        userApi.getPreferences(token),
        dreamApi.listDreams(token),          // all dreams, we filter below
        taskApi.listTasks(token),             // all tasks, we filter below
        analyticsApi.getDashboard(token),
    ]);

    // ── Extract prefs ─────────────────────────────────────────────────────────
    const prefsData = prefs.status === 'fulfilled' ? prefs.value : null;
    const name: string = prefsData?.name || prefsData?.user?.name || 'there';
    const motivationTone: string = prefsData?.motivationTone || 'NEUTRAL';

    // ── Extract + filter dreams ───────────────────────────────────────────────
    let dreamLines = '';
    if (dreams.status === 'fulfilled') {
        const allDreams: any[] = Array.isArray(dreams.value)
            ? dreams.value
            : (dreams.value?.dreams ?? []);
        const activeDreams = allDreams
            .filter((d: any) => ['ACTIVE', 'DRAFT'].includes(d.status))
            .slice(0, 4);
        if (activeDreams.length === 0) {
            dreamLines = '  (no active dreams yet)\n';
        } else {
            dreamLines = activeDreams.map((d: any) =>
                `  • [${d.status}] "${trunc(d.title, 55)}" — due ${fmtDate(d.deadline)} (id: ${d.id})`
            ).join('\n') + '\n';
        }
    } else {
        dreamLines = '  (could not load dreams)\n';
        await logger.warn('context-builder', 'Failed to fetch dreams', {});
    }

    // ── Extract + filter tasks ────────────────────────────────────────────────
    let taskLines = '';
    if (tasks.status === 'fulfilled') {
        const allTasks: any[] = Array.isArray(tasks.value)
            ? tasks.value
            : (tasks.value?.tasks ?? []);
        const activeTasks = allTasks
            .filter((t: any) => ['PENDING', 'IN_PROGRESS'].includes(t.status))
            .sort((a: any, b: any) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
            .slice(0, 5);

        if (activeTasks.length === 0) {
            taskLines = '  (no active tasks yet)\n';
        } else {
            taskLines = activeTasks.map((t: any) => {
                const progress = t.progress ?? 0;
                const checkpoints: any[] = t.checkpoints ?? [];
                // Find the active (first incomplete) checkpoint
                const activeCP = checkpoints
                    .filter((cp: any) => !cp.isCompleted)
                    .sort((a: any, b: any) => a.orderIndex - b.orderIndex)[0];
                const cpNote = activeCP
                    ? ` | next checkpoint: "${trunc(activeCP.title, 40)}" by ${fmtDate(activeCP.targetDate)}`
                    : '';
                return `  • [${t.status}] "${trunc(t.title, 50)}" — ${progress}% done, due ${fmtDate(t.deadline)}${cpNote} (id: ${t.id})`;
            }).join('\n') + '\n';
        }
    } else {
        taskLines = '  (could not load tasks)\n';
        await logger.warn('context-builder', 'Failed to fetch tasks', {});
    }

    // ── Extract dashboard analytics ───────────────────────────────────────────
    let analyticsLine = '';
    if (dashboard.status === 'fulfilled') {
        const d = dashboard.value;
        const disc = d?.disciplineScore ?? d?.currentWeek?.disciplineScore ?? '?';
        const cons = d?.consistencyScore ?? d?.currentWeek?.consistencyScore ?? '?';
        const state = d?.behavioralState ?? d?.currentWeek?.behavioralState ?? 'UNKNOWN';
        analyticsLine = `  Discipline: ${disc}/100 | Consistency: ${cons}/100 | State: ${state}\n`;
    } else {
        analyticsLine = '  (analytics not available)\n';
    }

    // ── Build the context block ───────────────────────────────────────────────
    const contextBlock = `
═══ USER CONTEXT (pre-loaded — use this, do NOT call tools to re-fetch these) ═══
Name: ${name}
Motivation tone: ${motivationTone}

DREAMS:
${dreamLines}
ACTIVE TASKS:
${taskLines}
THIS WEEK'S ANALYTICS:
${analyticsLine}═══════════════════════════════════════════════════════════`;

    await logger.info('context-builder', `[CACHE MISS] Context built for ${name} — dreams: ${dreamLines.split('\n').filter(Boolean).length}, tasks: ${taskLines.split('\n').filter(Boolean).length}`, {});

    const result: UserContext = { name, motivationTone, contextBlock };

    // ── Cache the result for 2 minutes ────────────────────────────────────────
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
