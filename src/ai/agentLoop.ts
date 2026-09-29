// src/ai/agentLoop.ts
// ─────────────────────────────────────────────────────────────────────────────
// The real agentic loop: model ⇄ tools, multi-turn, with a confirmation gate.
//
// This replaces the old "agentic loop" in orchestrator.ts which passed
// `tools: []` and therefore could never act — the model was told to call
// `searchTasks`/`getDashboard` in the system prompt and then had no tools at
// all, so anything the embedding router misrouted produced a confident
// hallucination.
//
// Flow per turn:
//   1. Call the model with the full tool catalogue.
//   2. If it asks for READ tools  → execute, append results, loop again.
//   3. If it asks for a WRITE tool → stop here and hand the call to the caller
//      for user confirmation. Nothing is mutated without a "yes".
//   4. If it answers with text    → done.
//
// Read calls that arrive *before* a write in the same batch are executed, so
// "mark the DSA task done" still resolves the task id first.
// ─────────────────────────────────────────────────────────────────────────────

import { executeWithFallback, type ChatMessage } from './llmClient';
import { TOOLS } from './tools';
import { parseToolArguments } from './jsonParse';
import { isReadTool, isWriteTool, isDestructiveTool } from './toolGuards';
import { normalizeDateArgs } from './dateGrounding';
import { executeTool } from './toolExecutor';
import { stripInternalKeys } from './resolution';
import { resolveTask, resolveDream } from '../services/entityResolver';
import { logger } from '../utils/logger';

const MAX_ITERATIONS = 4;
const MAX_TOOL_CALLS_PER_TURN = 5;

/**
 * Wall-clock budget for one user turn.
 *
 * space-bunny-free is a reasoning model on a free tier: a typical call is
 * 2-6s, but cold prompts have been observed at 40s+. With up to
 * MAX_ITERATIONS calls in sequence, a turn could otherwise run for minutes
 * with the user staring at a spinner. Past this budget we stop calling and
 * return whatever the model has already said.
 */
const TURN_BUDGET_MS = 45_000;

export interface PendingAction {
    name: string;
    args: Record<string, any>;
    destructive: boolean;
}

export type AgentLoopResult =
    | { kind: 'REPLY'; text: string }
    | { kind: 'CONFIRM_NEEDED'; action: PendingAction }
    | { kind: 'ERROR'; reason: string };

/**
 * Rewrite human names in tool args into real UUIDs.
 *
 * The model says `"title": "DSA sheet"`, the database wants a Task id. The
 * previous code only checked a handful of magic key names and silently dropped
 * unresolvable values — which surfaced to the user as "task not found".
 */
async function resolveEntityArgs(
    userId: string,
    rawArgs: Record<string, any>,
    toolName: string,
): Promise<Record<string, any>> {
    const args: Record<string, any> = stripInternalKeys(rawArgs ?? {});

    // dreamId / roadmapId may arrive as a title rather than a UUID.
    for (const key of ['dreamId', 'targetDream'] as const) {
        const v = args[key];
        if (typeof v === 'string' && v && !isUuid(v)) {
            const id = await resolveDream(userId, v);
            if (id) args.dreamId = id;
            else delete args[key];
        }
    }
    delete args.targetDream;

    for (const key of ['taskId', 'taskTitle'] as const) {
        const v = args[key];
        if (typeof v === 'string' && v && !isUuid(v)) {
            const id = await resolveTask(userId, v);
            if (id) args.taskId = id;
            else delete args[key];
        }
    }
    delete args.taskTitle;

    // The model sometimes puts a task's human name in `title` on a tool that
    // wants a `taskId` (e.g. updateCheckpoint). Only safe when `title` is NOT
    // a declared parameter of this tool — for createTask, `title` is the name
    // of the thing being created and must never be resolved to an existing id.
    const schema = (TOOLS as unknown as any[]).find(t => t.function.name === toolName)?.function?.parameters;
    const declaresTitle = Boolean(schema?.properties?.title);
    const requiresTaskId = (schema?.required ?? []).includes('taskId');

    if (requiresTaskId && !declaresTitle && !args.taskId && typeof args.title === 'string' && args.title) {
        const id = await resolveTask(userId, args.title);
        if (id) {
            args.taskId = id;
            delete args.title;
        }
    }

    return normalizeDateArgs(args);
}

function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Truncate tool output so one huge result can't blow the context window. */
function serialiseResult(result: any): string {
    if (result === null || result === undefined) return 'null';
    if (typeof result === 'string') return result.slice(0, 4000);

    let out: string;
    try {
        out = JSON.stringify(result);
    } catch {
        return 'Result could not be serialised.';
    }
    return out.length > 6000 ? out.slice(0, 6000) + ' …[truncated]' : out;
}

export async function runAgentLoop({
    userId,
    token,
    systemPrompt,
    history,
    userMessage,
    complexity = 'SIMPLE',
}: {
    userId: string;
    token: string;
    systemPrompt: string;
    history: any[];
    userMessage: string;
    complexity?: 'SIMPLE' | 'COMPLEX';
}): Promise<AgentLoopResult> {

    // The current user turn is appended explicitly. The old code read history
    // *before* persisting the new message and then built `[system, ...history]`,
    // so the model literally never saw what the user had just typed.
    const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(history as any[]),
        { role: 'user', content: userMessage },
    ];

    let iterations = 0;
    let totalToolCalls = 0;
    const startedAt = Date.now();
    let lastText = '';

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        if (iterations > 1 && Date.now() - startedAt > TURN_BUDGET_MS) {
            await logger.warn('agent-loop',
                `Turn budget exhausted after ${iterations} iterations`, { elapsedMs: Date.now() - startedAt });
            if (lastText) return { kind: 'REPLY', text: lastText };
            return { kind: 'ERROR', reason: 'turn_budget' };
        }

        let response: any;
        try {
            response = await executeWithFallback(messages, {
                complexity,
                tools: TOOLS as any,
                max_tokens: complexity === 'COMPLEX' ? 2048 : 1024,
            }, iterations);
        } catch (error: any) {
            await logger.error('agent-loop', 'LLM call failed', { error: error?.message });
            return { kind: 'ERROR', reason: error?.message ?? 'unknown' };
        }

        const message = response?.choices?.[0]?.message;
        if (!message) {
            return { kind: 'ERROR', reason: 'Empty response from model' };
        }

        const toolCalls: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];

        // ── No tool calls → the model answered. Done. ────────────────────────
        if (toolCalls.length === 0) {
            const text = (message.content ?? '').trim();
            if (text) return { kind: 'REPLY', text };
            // Reasoning model produced neither tool calls nor text at the cap.
            if (lastText) return { kind: 'REPLY', text: lastText };
            return { kind: 'ERROR', reason: 'Model produced no output' };
        }

        // Remember any prose that came with the tool call — if we run out of
        // budget before the model produces a final message, this is better than
        // showing an error.
        const preamble = (message.content ?? '').trim();
        if (preamble) lastText = preamble;

        // Record the assistant turn verbatim — the API requires the assistant
        // message that owns tool_calls to precede the tool results.
        messages.push({
            role: 'assistant',
            content: message.content ?? null,
            tool_calls: toolCalls,
        } as ChatMessage);

        const batch = toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
        let pendingAction: PendingAction | null = null;

        for (const call of batch) {
            const name = call?.function?.name;
            const callId = call?.id;
            if (!name || !callId) continue;

            totalToolCalls++;
            const rawArgs = parseToolArguments(call?.function?.arguments);

            // ── Write gate: stop and ask before mutating anything. ───────────
            if (isWriteTool(name)) {
                const args = await resolveEntityArgs(userId, rawArgs, name);
                await logger.info('agent-loop',
                    `[WRITE GATE] "${name}" → confirmation required`,
                    { args, destructive: isDestructiveTool(name) });
                pendingAction = { name, args, destructive: isDestructiveTool(name) };
                break;
            }

            // ── Read: execute and feed the result back. ──────────────────────
            const args = await resolveEntityArgs(userId, rawArgs, name);
            await logger.info('agent-loop', `[TOOL READ] "${name}"`, { args });

            let result: any;
            try {
                result = await executeTool(name, args, token);
            } catch (error: any) {
                result = { error: error?.message ?? 'tool failed' };
            }

            messages.push({
                role: 'tool',
                tool_call_id: callId,
                content: serialiseResult(result),
            } as ChatMessage);
        }

        if (pendingAction) {
            // Anything still unexecuted in this batch must be acknowledged or
            // the next request will carry tool_calls the model never saw a
            // result for, which most APIs reject.
            const answered = new Set(
                messages.filter(m => m.role === 'tool').map(m => m.tool_call_id),
            );
            for (const call of batch) {
                if (call?.id && !answered.has(call.id)) {
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify({ skipped: true, reason: 'Awaiting user confirmation.' }),
                    } as ChatMessage);
                }
            }
            return { kind: 'CONFIRM_NEEDED', action: pendingAction };
        }

        if (totalToolCalls > MAX_ITERATIONS * MAX_TOOL_CALLS_PER_TURN) {
            return { kind: 'ERROR', reason: 'Tool call limit exceeded' };
        }
    }

    await logger.warn('agent-loop', `Hit MAX_ITERATIONS=${MAX_ITERATIONS}`, {});
    if (lastText) return { kind: 'REPLY', text: lastText };
    return { kind: 'ERROR', reason: 'max_iterations' };
}
