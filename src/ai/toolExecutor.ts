// src/ai/toolExecutor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Executes a tool call from the Groq LLM by routing to the appropriate API
// adapter. Every call is wrapped in try/catch — failures return { error }
// instead of crashing the backend.
//
// LOGGING: Each tool invocation logs:
//   [TOOL START]  tool name + args
//   [TOOL OK]     summary of result (count/id/status)
//   [TOOL ERROR]  full error message + args (for debugging 500s)
// ─────────────────────────────────────────────────────────────────────────────

import { taskApi } from '../apiAdapter/taskApi';
import { dreamApi } from '../apiAdapter/dreamApi';
import { analyticsApi } from '../apiAdapter/analyticsApi';
import { userApi } from '../apiAdapter/userApi';
import { notificationApi } from '../apiAdapter/notificationApi';
import { roadmapApi } from '../apiAdapter/roadmapApi';
import { logger } from '../utils/logger';
import type { ToolName } from './tools';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Summarise a result for the OK log line (keeps logs small). */
function summarise(name: string, result: any): string {
    if (!result) return 'null';
    if (Array.isArray(result)) return `${result.length} item(s)`;
    if (result.id) return `id=${result.id.slice(0, 8)}`;
    if (result.disciplineScore !== undefined) return `disciplineScore=${result.disciplineScore}`;
    if (result.motivationTone) return `tone=${result.motivationTone}`;
    if (result.status) return `status=${result.status}`;
    if (result.text) return `text="${result.text.slice(0, 40)}"`;
    return 'ok';
}

/**
 * Strip startDate if it equals or is before today's calendar date.
 * Issue: LLM sends "YYYY-MM-DD" which JS parses as midnight UTC.
 * In IST (UTC+5:30) that midnight has already passed → task service rejects it.
 * Fix: omit startDate entirely — the service defaults to new Date() (always valid).
 */
function safeStartDate(v: any): string | undefined {
    if (!v) return undefined;
    const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD in UTC
    const s = String(v).slice(0, 10);
    return s <= today ? undefined : s;
}

/** Coerce LLM-provided priority to integer 1-5 (LLM sometimes sends a string). */
function coercePriority(v: any): number {
    const n = parseInt(String(v), 10);
    if (isNaN(n) || n < 1) return 1;
    if (n > 5) return 5;
    return n;
}

/** Coerce LLM-provided progress value to integer 0-100. */
function coerceProgress(v: any): number {
    const n = parseInt(String(v), 10);
    if (isNaN(n) || n < 0) return 0;
    if (n > 100) return 100;
    return n;
}

// ── Executor ─────────────────────────────────────────────────────────────────

export async function executeTool(
    name: ToolName | string,
    args: Record<string, any>,
    token: string,
): Promise<any> {
    args = args || {};

    // Log every tool invocation with its args before calling
    await logger.info('tool-executor', `[TOOL START] ${name}`, { args });

    try {
        let result: any;

        switch (name) {

            // ── Tasks — read ────────────────────────────────────────────────
            case 'searchTasks': {
                result = await taskApi.searchTasks(token, {
                    q: args.q,
                    dreamId: args.dreamId,
                    status: args.status
                });
                break;
            }

            case 'listTasks':
                result = await taskApi.listTasks(token, args.dreamId, args.status);
                break;

            case 'getTask':
                result = await taskApi.getTask(token, args.taskId);
                break;

            // ── Tasks — write ────────────────────────────────────────────────
            case 'createTask':
                result = await taskApi.createTask(token, {
                    title: args.title,
                    description: args.description,
                    deadline: args.deadline,
                    dreamId: args.dreamId,
                    skillId: args.skillId,
                    milestoneId: args.milestoneId,
                    priority: coercePriority(args.priority),
                    startDate: safeStartDate(args.startDate),
                    estimatedDuration: args.estimatedDuration
                        ? parseInt(String(args.estimatedDuration), 10)
                        : undefined,
                    checkpoints: args.checkpoints,
                });
                break;

            case 'updateTask':
                result = await taskApi.updateTask(token, args.taskId, {
                    ...args,
                    priority: args.priority ? coercePriority(args.priority) : undefined,
                    startDate: safeStartDate(args.startDate),
                });
                break;

            case 'updateTaskProgress':
                result = await taskApi.updateTaskProgress(
                    token,
                    args.taskId,
                    coerceProgress(args.value),
                );
                break;

            case 'completeTask':
                result = await taskApi.completeTask(token, args.taskId);
                break;

            case 'blockTask':
                result = await taskApi.blockTask(token, args.taskId);
                break;

            case 'archiveTask':
                result = await taskApi.archiveTask(token, args.taskId);
                break;

            // ── Checkpoints — write ────────────────────────────────────────
            case 'updateCheckpoint':
                result = await taskApi.updateCheckpoint(token, args.taskId, args.checkpointId, {
                    title: args.title,
                    targetDate: args.targetDate,
                });
                break;

            case 'updateCheckpointProgress':
                result = await taskApi.updateCheckpointProgress(
                    token,
                    args.taskId,
                    args.checkpointId,
                    parseInt(String(args.delta), 10),
                    args.localDate,
                );
                break;

            case 'deleteCheckpoint':
                result = await taskApi.deleteCheckpoint(token, args.taskId, args.checkpointId);
                break;

            // ── Dreams — read ──────────────────────────────────────────────
            case 'listDreams':
                result = await dreamApi.listDreams(token, args.status || 'ACTIVE');
                break;

            case 'searchDreams':
                result = await dreamApi.searchDreams(token, args.keyword, args.status);
                break;

            case 'getDream':
                result = await dreamApi.getDream(token, args.dreamId);
                break;

            case 'getDream':
                result = await dreamApi.getDream(token, args.dreamId);
                break;

            case 'syncDreamState':
                result = await dreamApi.syncDreamState(token, args);
                break;

            // ── Dreams — write ─────────────────────────────────────────────
            case 'updateDream':
                result = await dreamApi.updateDream(token, args.dreamId, args);
                break;

            case 'completeDream':
                result = await dreamApi.completeDream(token, args.dreamId);
                break;

            case 'failDream':
                result = await dreamApi.failDream(token, args.dreamId);
                break;

            case 'archiveDream':
                result = await dreamApi.archiveDream(token, args.dreamId);
                break;

            // ── Analytics — read ───────────────────────────────────────────
            case 'getDashboard':
                result = await analyticsApi.getDashboard(token);
                break;

            case 'listSprints':
                result = await analyticsApi.listSprints(token);
                break;

            case 'getSprint':
                result = await analyticsApi.getSprint(token, args.weekStart);
                break;

            // ── User ───────────────────────────────────────────────────────
            case 'getPreferences':
                result = await userApi.getPreferences(token);
                break;

            case 'updatePreferences': {
                // Fetch current prefs to fill in any values the LLM omitted
                let current: any = {};
                try {
                    current = await userApi.getPreferences(token);
                } catch { /* ignore — use defaults */ }
                result = await userApi.updatePreferences(token, {
                    motivationTone: args.motivationTone ?? current.motivationTone ?? 'NEUTRAL',
                    notificationFrequency: args.notificationFrequency
                        ? parseInt(String(args.notificationFrequency), 10)
                        : (current.notificationFrequency ?? 60),
                    sleepStart: args.sleepStart ?? current.sleepStart ?? '22:00',
                    sleepEnd: args.sleepEnd ?? current.sleepEnd ?? '07:00',
                    quietHours: args.quietHours ?? current.quietHours,
                });
                break;
            }

            case 'updateProfile':
                result = await userApi.updateProfile(token, { timezone: args.timezone });
                break;

            // ── Notifications ──────────────────────────────────────────────
            case 'listNotifications':
                result = await notificationApi.listNotifications(token);
                break;

            // ── Roadmap ───────────────────────────────────────────────────────
            case 'generateRoadmap':
                result = await roadmapApi.generateRoadmap(token, args.dreamId);
                break;

            case 'activateRoadmap':
                result = await roadmapApi.activateRoadmap(token, args.roadmapId);
                break;

            case 'getRoadmap':
                result = await roadmapApi.getRoadmap(token, args.roadmapId);
                break;

            case 'listRoadmaps':
                result = await roadmapApi.getByDream(token, args.dreamId);
                break;

            default:
                await logger.warn('tool-executor', `[TOOL UNKNOWN] ${name}`, {});
                return { error: `Unknown tool: ${name}` };
        }

        // Success log
        await logger.info('tool-executor', `[TOOL OK] ${name} → ${summarise(name, result)}`, {});
        return result;

    } catch (error: any) {
        // Extract the deepest error message from Axios responses
        const httpStatus = error?.response?.status;
        const errBody = error?.response?.data;
        const message =
            errBody?.error || errBody?.message ||
            error.message || 'Tool execution failed';

        await logger.error('tool-executor', `[TOOL ERROR] ${name} → HTTP ${httpStatus ?? 'N/A'}: ${message}`, {
            args,
            responseBody: errBody,
        });

        // Return error to LLM so it can gracefully explain, not crash the backend
        return {
            error: message,
            httpStatus,
        };
    }
}
