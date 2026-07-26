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
import prisma from '../config/database';

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

    await logger.info('tool-executor', `━━━ [TOOL EXECUTE] ▶ "${name}" ━━━`, { args });

    try {
        let result: any;

        switch (name) {

            // ── Tasks — read ────────────────────────────────────────────────
            case 'searchTasks': {
                await logger.info('tool-executor', `[DISPATCH] searchTasks → taskApi.searchTasks({ q: ${args.q}, dreamId: ${args.dreamId}, status: ${args.status} })`, {});
                result = await taskApi.searchTasks(token, {
                    q: args.q,
                    dreamId: args.dreamId,
                    status: args.status
                });
                break;
            }

            case 'listTasks':
                await logger.info('tool-executor', `[DISPATCH] listTasks → taskApi.listTasks({ dreamId: ${args.dreamId}, status: ${args.status} })`, {});
                result = await taskApi.listTasks(token, args.dreamId, args.status);
                break;

            case 'getTask':
                await logger.info('tool-executor', `[DISPATCH] getTask → taskApi.getTask({ taskId: ${args.taskId} })`, {});
                result = await taskApi.getTask(token, args.taskId);
                break;

            // ── Tasks — write ────────────────────────────────────────────────
            case 'createTask':
                await logger.info('tool-executor', `[DISPATCH] createTask → taskApi.createTask({ title: "${args.title}", deadline: ${args.deadline}, dreamId: ${args.dreamId}, priority: ${args.priority} })`, {});
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
                await logger.info('tool-executor', `[DISPATCH] updateTask → taskApi.updateTask({ taskId: ${args.taskId} })`, {});
                result = await taskApi.updateTask(token, args.taskId, {
                    ...args,
                    priority: args.priority ? coercePriority(args.priority) : undefined,
                    startDate: safeStartDate(args.startDate),
                });
                break;

            case 'updateTaskProgress':
                await logger.info('tool-executor', `[DISPATCH] updateTaskProgress → taskApi.updateTaskProgress({ taskId: ${args.taskId}, value: ${args.value} })`, {});
                result = await taskApi.updateTaskProgress(
                    token,
                    args.taskId,
                    coerceProgress(args.value),
                );
                break;

            case 'completeTask':
                await logger.info('tool-executor', `[DISPATCH] completeTask → taskApi.completeTask({ taskId: ${args.taskId} })`, {});
                result = await taskApi.completeTask(token, args.taskId);
                break;

            case 'blockTask':
                await logger.info('tool-executor', `[DISPATCH] blockTask → taskApi.blockTask({ taskId: ${args.taskId} })`, {});
                result = await taskApi.blockTask(token, args.taskId);
                break;

            case 'archiveTask':
                await logger.info('tool-executor', `[DISPATCH] archiveTask → taskApi.archiveTask({ taskId: ${args.taskId} })`, {});
                result = await taskApi.archiveTask(token, args.taskId);
                break;

            // ── Checkpoints — write ────────────────────────────────────────
            case 'updateCheckpoint':
                await logger.info('tool-executor', `[DISPATCH] updateCheckpoint → taskApi.updateCheckpoint({ taskId: ${args.taskId}, checkpointId: ${args.checkpointId} })`, {});
                result = await taskApi.updateCheckpoint(token, args.taskId, args.checkpointId, {
                    title: args.title,
                    targetDate: args.targetDate,
                });
                break;

            case 'updateProgressQuick':
                await logger.info('tool-executor', `[DISPATCH] updateProgressQuick → resolving context`, { args });
                try {
                    const base64Payload = token.split('.')[1];
                    const decodedToken = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
                    const userId = decodedToken.userId;
                    
                    if (!userId) throw new Error('Unauthorized');
                    
                    const amount = parseInt(String(args.amount), 10);
                    const isAbsolute = String(args.type).toUpperCase() === 'TO';
                    
                    // 1. Check for active checkpoint
                    const activeCp = await prisma.taskCheckpoint.findFirst({
                        where: { task: { dream: { userId } }, isCompleted: false },
                        orderBy: { targetDate: 'asc' },
                        include: { task: true }
                    });
                    
                    if (activeCp) {
                        const delta = isAbsolute ? (amount - activeCp.progress) : amount;
                        if (delta === 0) {
                            result = { error: 'Checkpoint is already at this progress level.' };
                            break;
                        }
                        result = await taskApi.updateCheckpointProgress(token, activeCp.taskId, activeCp.id, delta, args.localDate || new Date().toISOString().split('T')[0]);
                        result.systemInstruction = `✅ Progress updated! Checkpoint "${activeCp.title}" is now at ${Math.min(100, Math.max(0, activeCp.progress + delta))}%.`;
                        break;
                    }
                    
                    // 2. Check for active task
                    const activeTask = await prisma.task.findFirst({
                        where: { dream: { userId }, status: 'IN_PROGRESS' },
                        orderBy: { updatedAt: 'desc' }
                    });
                    
                    if (activeTask) {
                        const currentProgress = activeTask.progressPercent || 0;
                        const targetValue = isAbsolute ? amount : (currentProgress + amount);
                        const finalValue = Math.min(100, Math.max(0, targetValue));
                        if (finalValue === currentProgress) {
                            result = { error: 'Task is already at this progress level.' };
                            break;
                        }
                        result = await taskApi.updateTaskProgress(token, activeTask.id, finalValue);
                        result.systemInstruction = `✅ Progress updated! Task "${activeTask.title}" is now at ${finalValue}%.`;
                        break;
                    }
                    
                    result = { error: 'No active tasks or checkpoints found to update.' };
                } catch (err: any) {
                    result = { error: err.message };
                }
                break;

            case 'updateCheckpointProgress':
                await logger.info('tool-executor', `[DISPATCH] updateCheckpointProgress → taskApi.updateCheckpointProgress({ taskId: ${args.taskId}, checkpointId: ${args.checkpointId}, delta: ${args.delta} })`, {});
                result = await taskApi.updateCheckpointProgress(
                    token,
                    args.taskId,
                    args.checkpointId,
                    parseInt(String(args.delta), 10),
                    args.localDate,
                );
                break;

            case 'deleteCheckpoint':
                await logger.info('tool-executor', `[DISPATCH] deleteCheckpoint → taskApi.deleteCheckpoint({ taskId: ${args.taskId}, checkpointId: ${args.checkpointId} })`, {});
                result = await taskApi.deleteCheckpoint(token, args.taskId, args.checkpointId);
                break;

            // ── Dreams — read ──────────────────────────────────────────────
            case 'listDreams':
                await logger.info('tool-executor', `[DISPATCH] listDreams → dreamApi.listDreams({ status: ${args.status || 'ACTIVE'} })`, {});
                result = await dreamApi.listDreams(token, args.status || 'ACTIVE');
                break;

            case 'searchDreams':
                await logger.info('tool-executor', `[DISPATCH] searchDreams → dreamApi.searchDreams({ keyword: "${args.keyword}", status: ${args.status} })`, {});
                result = await dreamApi.searchDreams(token, args.keyword, args.status);
                break;

            case 'getDream':
                await logger.info('tool-executor', `[DISPATCH] getDream → dreamApi.getDream({ dreamId: ${args.dreamId} })`, {});
                result = await dreamApi.getDream(token, args.dreamId);
                break;

            case 'syncDreamState':
                await logger.info('tool-executor', `[DISPATCH] syncDreamState → dreamApi.syncDreamState({ title: "${args.title}", domain: "${args.domain}", deadline: ${args.deadline}, confirmed: ${args.confirmed} })`, {});
                result = await dreamApi.syncDreamState(token, args);
                break;

            // ── Dreams — write ─────────────────────────────────────────────
            case 'updateDream':
                await logger.info('tool-executor', `[DISPATCH] updateDream → dreamApi.updateDream({ dreamId: ${args.dreamId} })`, {});
                result = await dreamApi.updateDream(token, args.dreamId, args);
                break;

            case 'completeDream':
                await logger.info('tool-executor', `[DISPATCH] completeDream → dreamApi.completeDream({ dreamId: ${args.dreamId} })`, {});
                result = await dreamApi.completeDream(token, args.dreamId);
                break;

            case 'failDream':
                await logger.info('tool-executor', `[DISPATCH] failDream → dreamApi.failDream({ dreamId: ${args.dreamId} })`, {});
                result = await dreamApi.failDream(token, args.dreamId);
                break;

            case 'archiveDream':
                await logger.info('tool-executor', `[DISPATCH] archiveDream → dreamApi.archiveDream({ dreamId: ${args.dreamId} })`, {});
                result = await dreamApi.archiveDream(token, args.dreamId);
                break;

            // ── Analytics — read ───────────────────────────────────────────
            case 'getDashboard':
                await logger.info('tool-executor', `[DISPATCH] getDashboard → analyticsApi.getDashboard()`, {});
                result = await analyticsApi.getDashboard(token);
                break;

            case 'listSprints':
                await logger.info('tool-executor', `[DISPATCH] listSprints → analyticsApi.listSprints()`, {});
                result = await analyticsApi.listSprints(token);
                break;

            case 'getSprint':
                await logger.info('tool-executor', `[DISPATCH] getSprint → analyticsApi.getSprint({ weekStart: ${args.weekStart} })`, {});
                result = await analyticsApi.getSprint(token, args.weekStart);
                break;

            // ── User ───────────────────────────────────────────────────────
            case 'getPreferences':
                await logger.info('tool-executor', `[DISPATCH] getPreferences → userApi.getPreferences()`, {});
                result = await userApi.getPreferences(token);
                break;

            case 'updatePreferences': {
                await logger.info('tool-executor', `[DISPATCH] updatePreferences → userApi.updatePreferences({ motivationTone: ${args.motivationTone} })`, {});
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
                await logger.info('tool-executor', `[DISPATCH] updateProfile → userApi.updateProfile({ timezone: ${args.timezone} })`, {});
                result = await userApi.updateProfile(token, { timezone: args.timezone });
                break;

            // ── Notifications ──────────────────────────────────────────────
            case 'listNotifications':
                await logger.info('tool-executor', `[DISPATCH] listNotifications → notificationApi.listNotifications()`, {});
                result = await notificationApi.listNotifications(token);
                break;

            // ── Roadmap ────────────────────────────────────────────────────
            case 'generateRoadmap':
                await logger.info('tool-executor', `[DISPATCH] generateRoadmap → roadmapApi.generateRoadmap({ dreamId: ${args.dreamId} })`, {});
                result = await roadmapApi.generateRoadmap(token, args.dreamId);
                break;

            case 'activateRoadmap':
                await logger.info('tool-executor', `[DISPATCH] activateRoadmap → roadmapApi.activateRoadmap({ roadmapId: ${args.roadmapId} })`, {});
                result = await roadmapApi.activateRoadmap(token, args.roadmapId);
                break;

            case 'getRoadmap':
                await logger.info('tool-executor', `[DISPATCH] getRoadmap → roadmapApi.getRoadmap({ roadmapId: ${args.roadmapId} })`, {});
                result = await roadmapApi.getRoadmap(token, args.roadmapId);
                break;

            case 'listRoadmaps':
                await logger.info('tool-executor', `[DISPATCH] listRoadmaps → roadmapApi.getByDream({ dreamId: ${args.dreamId} })`, {});
                result = await roadmapApi.getByDream(token, args.dreamId);
                break;

            default:
                await logger.warn('tool-executor', `[TOOL UNKNOWN] No dispatch found for "${name}"`, {});
                return { error: `Unknown tool: ${name}` };
        }

        await logger.info('tool-executor', `━━━ [TOOL DONE] ✅ "${name}" → ${summarise(name, result)} ━━━`, {});
        return result;

    } catch (error: any) {
        const httpStatus = error?.response?.status;
        const errBody = error?.response?.data;
        const message =
            errBody?.error || errBody?.message ||
            error.message || 'Tool execution failed';

        await logger.error('tool-executor', `━━━ [TOOL ERROR] ❌ "${name}" → HTTP ${httpStatus ?? 'N/A'}: ${message} ━━━`, {
            args,
            responseBody: errBody,
        });

        return {
            error: message,
            httpStatus,
        };
    }
}
