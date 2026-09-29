// src/ai/orchestrator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Chat entry point for the agent.
//
// Pipeline:
//   1. Load history, persist the user's message.
//   2. If an ActionSession exists → resume it (slot-fill or confirm).
//   3. Otherwise → run the real agent loop (see agentLoop.ts) so the model can
//      call tools itself.
//   4. Writes stop the loop and become a confirmation prompt.
//
// What changed vs. the previous version:
//   • The model now actually receives the tool catalogue. Before, the final
//     "agentic loop" passed `tools: []`, so the model could never act and any
//     router miss became a confident hallucination.
//   • The user's current message is guaranteed to be in the LLM payload.
//     Previously history was read *before* the message was persisted and the
//     payload was built as `[system, ...history]` — the model never saw the
//     turn it was being asked to answer.
//   • The 3-stage intent→route→extract chain (3–5 sequential LLM calls, magic
//     0.60/0.03 embedding thresholds) is gone. One model call with tools
//     subsumes all of it and doesn't silently degrade when embeddings drift.
//   • Every JSON.parse of model output goes through safeJsonParse.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../config/database';
import { logger } from '../utils/logger';
import { chatService } from '../modules/chat/chat.service';
import { buildUserContext, invalidateContextCache } from './contextBuilder';
import { buildSystemPrompt } from './systemPrompt';
import { runAgentLoop, type PendingAction } from './agentLoop';
import { TOOLS } from './tools';
import { callLLM } from './llmClient';
import { safeJsonParse } from './jsonParse';
import { executeTool } from './toolExecutor';
import { normalizeDateArgs } from './dateGrounding';
import { toolLabel, toolLabelPast, isDestructiveTool } from './toolGuards';
import { stripInternalKeys } from './resolution';
import { notificationWS } from '../modules/notification/websocket.server';
import { pushService } from '../modules/notification/push.service';
import { hindsightService } from './hindsightService';

export interface ChatResponse {
    text: string;
    responseMode: 'CHAT' | 'SUCCESS' | 'ERROR';
}

/** Look up a tool's JSON schema by name from the shared TOOLS catalogue. */
function toolSchema(name: string): any {
    return (TOOLS as unknown as any[]).find(t => t.function.name === name);
}

function requiredFieldsFor(name: string): string[] {
    return toolSchema(name)?.function?.parameters?.required ?? [];
}

/**
 * Render resolved args as a confirmation summary.
 *
 * UUIDs and empty values are dropped — the user confirms against a human
 * description of the change, not a JSON blob.
 */
function buildConfirmSummary(toolName: string, args: Record<string, any>): string {
    const clean = stripInternalKeys(normalizeDateArgs({ ...args }));
    const lines: string[] = [];

    for (const [k, v] of Object.entries(clean)) {
        if (v === null || v === undefined || v === '') continue;
        if (k === 'confirmed') continue;

        if (Array.isArray(v)) {
            if (v.length === 0) continue;
            lines.push(`• **${k}**: ${v.length} checkpoint(s)`);
            continue;
        }
        lines.push(`• **${k}**: ${v}`);
    }

    if (lines.length === 0) return 'No additional details.';
    return lines.join('\n');
}

/** Short prompt for the single field we still need. */
async function askForField(toolName: string, field: string, collected: Record<string, any>): Promise<string> {
    const schema = toolSchema(toolName)?.function?.parameters ?? {};
    const fieldDesc = schema.properties?.[field]?.description;

    const question = await callLLM([{
        role: 'system',
        content: `You are a friendly assistant collecting one missing detail so you can ${toolLabel(toolName)}.
The user has already provided: ${JSON.stringify(collected)}.
You still need: "${field}"${fieldDesc ? ` (${fieldDesc})` : ''}.
Ask ONE short, warm, natural question for it. Name the thing in plain English, not the field name.
Output only the question — no preamble, no explanation.`,
    }], { max_tokens: 120, temperature: 0.7 });

    return question || `Could you tell me the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}?`;
}

/**
 * Turn a raw tool result into a warm reply.
 *
 * Falls back to a deterministic string when the model is unavailable, so a
 * successful write never surfaces as an empty bubble.
 */
async function naturalizeResult(toolName: string, result: any): Promise<string> {
    if (result?.error) {
        return `That didn't go through — ${result.error}. Want to try that again?`;
    }

    // Service-driven tools (syncDreamState) return a ready-made instruction.
    if (result?.status === 'COMPLETE' && result.systemInstruction) {
        return result.systemInstruction;
    }

    const content = await callLLM([{
        role: 'system',
        content: `You are a friendly AI assistant. An action just completed successfully in the user's planner.
Action: ${toolLabel(toolName)}
Result: ${JSON.stringify(result)?.slice(0, 1500)}

Write a short, warm, conversational confirmation (1-3 sentences).
Rules:
- NEVER mention UUIDs, database ids, raw JSON, or tool names.
- NEVER show error codes or HTTP status numbers.
- Reference any created/updated item by its title.
- Do not ask a follow-up question — just confirm.
- Output only the reply text.`,
    }], { max_tokens: 200, temperature: 0.7 });

    return content || `Done — I've ${toolLabelPast(toolName)}.`;
}

/** Yes/No/Correction classification for a pending confirmation. */
async function classifyConfirmation(message: string, toolName: string, fields: Record<string, any>) {
    const text = message.trim().toLowerCase();

    // Fast path: avoid an LLM round-trip for the overwhelmingly common cases.
    if (/^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|proceed|confirm|correct|right|please do)\b/.test(text) && text.length <= 30) {
        return { intent: 'YES' as const, corrected_fields: {} };
    }
    if (/^(no|nope|nah|cancel|abort|stop|never ?mind|don'?t|do not)\b/.test(text) && text.length <= 30) {
        return { intent: 'NO' as const, corrected_fields: {} };
    }

    const raw = await callLLM([{
        role: 'system',
        content: `Classify the user's reply to a confirmation prompt for the action "${toolLabel(toolName)}".
Data collected so far: ${JSON.stringify(fields)}
User replied: "${message}"

Return JSON: { "intent": "YES" | "NO" | "CORRECTION", "corrected_fields": {} }
- YES: agrees / wants to proceed (yes, do it, go ahead, looks good, confirm).
- NO: declines / cancels (no, cancel, never mind, stop).
- CORRECTION: is fixing specific values ("make it friday", "priority 5", "call it X").
  Put every corrected value in corrected_fields, keyed by the original field name.
  The allowed field names are: ${requiredFieldsFor(toolName).join(', ') || 'none'}.
  If the user changes a field that isn't in that list, still map it to the closest one.
Output only valid JSON.`,
    }], { jsonMode: true, max_tokens: 250, temperature: 0 });

    const parsed = safeJsonParse<{ intent?: string; corrected_fields?: Record<string, any> }>(raw, {});
    const intent = parsed.intent === 'YES' || parsed.intent === 'NO' ? parsed.intent
        : parsed.intent === 'CORRECTION' ? 'CORRECTION'
        : 'YES';   // default to proceeding matches user expectation on ambiguity

    return { intent: intent as 'YES' | 'NO' | 'CORRECTION', corrected_fields: parsed.corrected_fields ?? {} };
}

/** Extra system-prompt guidance injected while a session is in flight. */
function sessionPromptSuffix(status: string, toolName: string, collected: Record<string, any>): string {
    if (status === 'SLOT_FILLING') {
        return `

═══ IN-PROGRESS ACTION ═══
You are midway through: ${toolLabel(toolName)}.
Details already collected: ${JSON.stringify(collected)}
Required fields: ${requiredFieldsFor(toolName).join(', ') || 'none'}

The user just replied with more information. Merge it into what you have and
call ${toolName} again with the complete set of arguments. Do not ask a
question yourself — the backend handles the missing-field prompt.`;
    }

    return `

═══ CONFIRMATION ANSWER ═══
The user was asked to confirm: ${toolLabel(toolName)}.
Data shown to them: ${JSON.stringify(collected)}
Their reply: (the next user message)
If they said yes, call ${toolName} now with exactly those arguments.
If they cancelled, just acknowledge briefly in plain text — call no tools.
If they corrected something, call ${toolName} with the corrected value.`;
}

export const orchestrator = {
    async process({ userId, message, token }: { userId: string; message: string; token: string }): Promise<ChatResponse> {
        const pipelineStart = Date.now();
        await logger.info('orchestrator', 'Pipeline START', { userId, msgLength: message.length });

        // 1. History first, then persist — the loop re-appends the current
        //    message itself so it must not already be in the window.
        const history = await chatService.getConversationWindow(userId, 10);
        await chatService.saveMessage(userId, 'user', message);

        // 2. Context & Hindsight Memory
        let contextBlock = '';
        let motivationTone = 'EMPATHETIC';
        let name = 'Friend';
        let agentName = 'IgniteMate';

        try {
            const ctx = await buildUserContext(token, userId);
            contextBlock = ctx.contextBlock;
            motivationTone = ctx.motivationTone;
            name = ctx.name || ctx.preferredName || 'Friend';
            agentName = ctx.agentName || 'IgniteMate';
        } catch (err: any) {
            await logger.warn('orchestrator', 'Context build failed', { err: err.message });
        }

        // Retain user preference/persona statements in Hindsight Memory Engine
        if (/goggins|ronaldo|cr7|mentality|prefer|habit|like|talk to me|speak to me|persona|tone/i.test(message)) {
            await hindsightService.retain({
                userId,
                eventType: 'USER_PREFERENCE',
                content: `User tone / persona preference: "${message}"`,
            });
        }

        // Recall memories for this turn from Hindsight Engine
        const memories = await hindsightService.recall({ userId, query: message, topK: 3 });
        let memoryBlock = '';
        if (memories.length > 0) {
            memoryBlock = '\n\n=== RECALLED USER MEMORIES & PREFERENCES (HINDSIGHT) ===\n' +
                memories.map(m => `• [${m.eventType}] ${m.content}`).join('\n') +
                '\nIMPORTANT: Adhere strictly to the above remembered user preferences, persona (e.g. David Goggins / CR7 relentless tone), and schedule habits.';
        }

        let systemPrompt = buildSystemPrompt(contextBlock, motivationTone, name) + memoryBlock;

        // ─────────────────────────────────────────────────────────────────────
        // 3. Resume an in-flight action session
        // ─────────────────────────────────────────────────────────────────────
        const session = await prisma.actionSession.findUnique({ where: { userId } });

        if (session) {
            await logger.info('orchestrator', 'Action session HIT', {
                status: session.status, targetTool: session.targetTool,
            });

            const collected = (session.collectedFields as Record<string, any>) ?? {};
            systemPrompt += sessionPromptSuffix(session.status, session.targetTool, collected);

            // ── PENDING_CONFIRM: classify yes / no / correction ──────────────
            if (session.status === 'PENDING_CONFIRM') {
                const verdict = await classifyConfirmation(message, session.targetTool, collected);
                await logger.info('orchestrator', `PENDING_CONFIRM → ${verdict.intent}`, { tool: session.targetTool });

                if (verdict.intent === 'NO') {
                    await prisma.actionSession.delete({ where: { userId } });
                    const text = "No problem, I've cancelled that. What would you like to do instead?";
                    return finish(userId, text, 'CHAT', agentName);
                }

                if (verdict.intent === 'CORRECTION' && Object.keys(verdict.corrected_fields).length > 0) {
                    // Give the model a chance to re-issue the call with the fix.
                    await prisma.actionSession.update({
                        where: { userId },
                        data: { collectedFields: { ...collected, ...verdict.corrected_fields }, status: 'SLOT_FILLING' },
                    });
                    // Fall through to the agent loop below, which re-issues it.
                } else {
                    const args = normalizeDateArgs(stripInternalKeys(collected));
                    const result = await executeTool(session.targetTool, args, token);
                    await prisma.actionSession.delete({ where: { userId } });
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(session.targetTool, result);
                    return finish(userId, text, result?.error ? 'CHAT' : 'SUCCESS', agentName);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. Agent loop
        // ─────────────────────────────────────────────────────────────────────
        await logger.info('orchestrator', 'Entering agent loop');
        const result = await runAgentLoop({
            userId, token, systemPrompt, history, userMessage: message,
        });

        if (result.kind === 'REPLY') {
            await logger.info('orchestrator', 'Pipeline FINISHED (reply)', { totalMs: Date.now() - pipelineStart });
            return finish(userId, result.text, 'CHAT', agentName);
        }

        if (result.kind === 'CONFIRM_NEEDED') {
            const { action } = result;
            const required = requiredFieldsFor(action.name);
            const missing = required.filter(f => {
                const v = action.args[f];
                return v === undefined || v === null || v === '';
            });

            // Write gate fired. Decide: gather more, or ask to confirm?
            if (missing.length > 0) {
                await logger.info('orchestrator', 'Write gate → SLOT_FILLING', { tool: action.name, missing });
                await prisma.actionSession.upsert({
                    where: { userId },
                    create: { userId, targetTool: action.name, status: 'SLOT_FILLING', collectedFields: action.args },
                    update: { targetTool: action.name, status: 'SLOT_FILLING', collectedFields: action.args },
                });

                // syncDreamState owns its own slot-filling conversation.
                if (action.name === 'syncDreamState') {
                    const partial = await executeTool(action.name, action.args, token);
                    const instruction = partial?.systemInstruction
                        ?? `I still need: ${(partial?.missingFields ?? missing).join(', ')}`;
                    const text = await callLLM([{
                        role: 'system',
                        content: `You are a friendly assistant helping create a dream. ${instruction}
Output only one short warm question sentence asking the user for that.`,
                    }], { max_tokens: 100, temperature: 0.7 }) || instruction;
                    return finish(userId, text, 'CHAT', agentName);
                }

                const text = await askForField(action.name, missing[0], action.args);
                return finish(userId, text, 'CHAT', agentName);
            }

            // All required fields present → confirmation.
            await logger.info('orchestrator', 'Write gate → PENDING_CONFIRM', { tool: action.name });
            await prisma.actionSession.upsert({
                where: { userId },
                create: { userId, targetTool: action.name, status: 'PENDING_CONFIRM', collectedFields: action.args },
                update: { targetTool: action.name, status: 'PENDING_CONFIRM', collectedFields: action.args },
            });

            const summary = buildConfirmSummary(action.name, action.args);
            const warn = action.destructive || isDestructiveTool(action.name)
                ? `\n\n⚠️ This cannot be undone.`
                : '';
            const text = `Here's what I'm about to do — ${toolLabel(action.name)}:\n${summary}${warn}\n\nShall I go ahead? (Yes / No)`;
            return finish(userId, text, 'CHAT', agentName);
        }

        // ERROR
        await logger.error('orchestrator', 'Agent loop failed', { reason: result.reason });
        const errText = "I'm having trouble reaching my thinking components right now. Could you try that again?";
        return finish(userId, errText, 'ERROR', agentName);
    },
};

/** Persist the assistant turn and fire a push notification if nobody's online. */
async function finish(
    userId: string,
    text: string,
    responseMode: ChatResponse['responseMode'],
    agentName: string,
): Promise<ChatResponse> {
    await chatService.saveMessage(userId, 'assistant', text);

    if (!notificationWS.hasActiveClients(userId)) {
        await pushService.sendPushNotification(userId, {
            title: agentName,
            body: text,
            data: { url: '/app/home' },
        }).catch(err => logger.warn('orchestrator', 'Push fallback failed', { err: err.message }));
    }

    return { text, responseMode };
}

export type { PendingAction };
