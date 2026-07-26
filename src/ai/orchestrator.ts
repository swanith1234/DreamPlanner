// src/ai/orchestrator.ts
import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { chatService } from '../modules/chat/chat.service';
import { getRelevantTools } from './hybridRouter';
import { executeTool } from './toolExecutor';
import { buildUserContext, invalidateContextCache } from './contextBuilder';
import { buildSystemPrompt } from './systemPrompt';
import { notificationWS } from '../modules/notification/websocket.server';
import { pushService } from '../modules/notification/push.service';
import prisma from '../config/database';
import { resolveTask, resolveDream } from '../services/entityResolver';
import { dreamService } from '../modules/dream/dream.service';

import { executeWithFallback, type ChatMessage } from './llmClient';

export interface ChatResponse {
    text: string;
    responseMode: 'CHAT' | 'SUCCESS' | 'ERROR';
}

// Tools that skip PENDING_CONFIRM and execute immediately once all required fields are gathered
const SKIP_CONFIRMATION_TOOLS = new Set(['updateProgressQuick']);

// ─────────────────────────────────────────────────────────────────────────────
// naturalizeResult
// Converts any raw tool result (JSON, error, array, object) into a warm,
// human-readable reply. Never exposes UUIDs, raw JSON, or HTTP status codes.
// ─────────────────────────────────────────────────────────────────────────────
async function naturalizeResult(
    toolName: string,
    result: any,
    userQuery: string,
): Promise<string> {
    try {
        const resultSummary = result?.error
            ? `ERROR: ${result.error}`
            : JSON.stringify(result);

        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{
                role: 'system',
                content: `You are a friendly AI assistant. The user asked: "${userQuery}".
The system executed the action "${toolName}" and got this result:
${resultSummary}

Write a short, warm, conversational reply (2-4 sentences max) summarizing what happened.
Rules:
- NEVER mention UUIDs, database IDs, or raw JSON.
- NEVER show error codes or HTTP status numbers.
- If it's an error like "not found", explain what that means naturally.
- If it's a list of items, summarize them by name/title only.
- If it's a creation/update/delete success, confirm it warmly.
- Use the user's first name only if you know it from context.
- Output only the reply text, nothing else.`,
            }],
            max_tokens: 150,
            temperature: 0.7,
        });
        return response.choices[0]?.message?.content?.trim()
            ?? 'Done! Let me know if there\'s anything else I can help with.';
    } catch {
        return 'Done! Let me know if there\'s anything else you need.';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────
function isValidUUID(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateExtractedTypes
// Strictly compares extracted JSON types against the JSON schema types.
// Returns an array of error strings if mismatches are found.
// ─────────────────────────────────────────────────────────────────────────────
function validateExtractedTypes(extracted: Record<string, any>, schema: any): string[] {
    const errors: string[] = [];
    const props = schema?.function?.parameters?.properties || {};
    
    for (const [key, value] of Object.entries(extracted)) {
        if (value === null || value === undefined) continue;
        
        const propSchema = props[key];
        if (!propSchema) continue;

        const type = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;
        
        if (type === 'integer' || type === 'number') {
            if (typeof value !== 'number') {
                errors.push(`Field '${key}' must be a number, but got ${typeof value} '${value}'.`);
            }
        } else if (type === 'boolean') {
            if (typeof value !== 'boolean') {
                errors.push(`Field '${key}' must be a boolean, but got ${typeof value} '${value}'.`);
            }
        } else if (type === 'string') {
            if (typeof value !== 'string') {
                errors.push(`Field '${key}' must be a string, but got ${typeof value} '${value}'.`);
            } else if (key === 'deadline' || key === 'startDate' || key === 'targetDate') {
                // strict date check YYYY-MM-DD
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    errors.push(`Field '${key}' must be exactly YYYY-MM-DD format, but got '${value}'.`);
                }
            }
        }
    }
    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractWithAutoCorrection
// Handles extraction with type validation and up to 3 auto-correction attempts.
// ─────────────────────────────────────────────────────────────────────────────
async function extractWithAutoCorrection(
    systemPromptBase: string,
    history: any[],
    schema: any,
    isSlotFilling: boolean
): Promise<any> {
    let extractionAttempts = 0;
    let correctionPrompt = '';
    
    while (extractionAttempts < 3) {
        extractionAttempts++;
        const systemPrompt = correctionPrompt 
            ? `${systemPromptBase}\n\nCRITICAL FIX REQUIRED:\n${correctionPrompt}` 
            : systemPromptBase;
            
        // We append history to provide context for resolving pronouns ("that one")
        const messages: any[] = [{ role: 'system', content: systemPrompt }, ...history];

        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages,
            response_format: { type: 'json_object' },
            max_tokens: 400,
            temperature: 0,
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        
        // If slot filling and diverting, or requests more history, return immediately
        if (isSlotFilling && (parsed.is_diverting === true || parsed.needs_more_history === true)) {
            return parsed;
        }

        const extractedToValidate = isSlotFilling ? (parsed.extracted_fields || {}) : parsed;
        const errors = validateExtractedTypes(extractedToValidate, schema);
        
        if (errors.length > 0) {
            correctionPrompt = `Errors found:\n` + errors.map((e, i) => `${i+1}. ${e}`).join('\n') + `\nFix ALL these errors and output the full JSON again.`;
            await logger.warn('orchestrator', `Extraction type mismatch (Attempt ${extractionAttempts})`, { errors });
        } else {
            return parsed; // Types are valid
        }
    }
    
    // Fallback if max attempts reached
    await logger.error('orchestrator', 'Extraction failed after 3 attempts due to type mismatches', {});
    return isSlotFilling ? { extracted_fields: {}, is_diverting: false } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveMissingSlots
// Autonomously executes read-only tools to fetch database context for missing
// entities (e.g., listDreams if dreamId is missing) to allow zero-touch derivation.
// ─────────────────────────────────────────────────────────────────────────────
async function deriveMissingSlots(missingFields: string[], token: string): Promise<string> {
    const derivationPromises: Promise<any>[] = [];
    const contextMap: Record<string, string> = {};

    if (missingFields.includes('dreamId') || missingFields.includes('_dreamTitle')) {
        await logger.info('orchestrator', '[DERIVATION] Enqueueing listDreams to resolve missing dreamId', {});
        derivationPromises.push(
            executeTool('listDreams', { status: 'ACTIVE' }, token).then(res => {
                contextMap['Dreams List'] = Array.isArray(res) 
                    ? res.map(d => `ID: ${d.id} | Title: ${d.title}`).join('\n') 
                    : 'No active dreams found.';
            }).catch(e => { contextMap['Dreams List'] = 'Failed to fetch'; })
        );
    }
    
    if (missingFields.includes('taskId') || missingFields.includes('_taskTitle')) {
        await logger.info('orchestrator', '[DERIVATION] Enqueueing listTasks to resolve missing taskId', {});
        derivationPromises.push(
            executeTool('listTasks', { status: 'PENDING' }, token).then(res => {
                contextMap['Pending Tasks List'] = Array.isArray(res) 
                    ? res.map(t => `ID: ${t.id} | Title: ${t.title}`).join('\n') 
                    : 'No pending tasks found.';
            }).catch(e => { contextMap['Pending Tasks List'] = 'Failed to fetch'; })
        );
    }

    if (derivationPromises.length === 0) return '';

    await Promise.all(derivationPromises);
    
    let derivationContext = `\n--- DERIVED DATABASE CONTEXT ---\nThe following data was fetched from the database to help you resolve the missing fields. Use the IDs below if they match the user's intent:\n`;
    for (const [key, val] of Object.entries(contextMap)) {
        derivationContext += `\n[${key}]\n${val}\n`;
    }
    return derivationContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveEntityArgs
// Converts any dreamId / taskId reference into a real UUID, in priority order:
//   1. Already a UUID → pass through
//   2. Temporal signal ("oldest", "newest") → Prisma ORDER BY createdAt
//   3. Title/keyword → vector similarity search (entityResolver)
//   4. Still not a UUID → auto-fetch all active entities:
//        • Exactly 1  → use it automatically
//        • Multiple   → clear the field (adds it to missingFields) and store
//                       choices in _dreamChoices so the slot-fill prompt can
//                       present a numbered list to the user
// ─────────────────────────────────────────────────────────────────────────────
async function resolveEntityArgs(userId: string, args: Record<string, any>): Promise<Record<string, any>> {
    const resolved = { ...args };

    // ── dreamId ──────────────────────────────────────────────────────────────
    if (resolved.dreamId && typeof resolved.dreamId === 'string') {
        if (!isValidUUID(resolved.dreamId)) {
            const hint = resolved.dreamId.toLowerCase();
            const OLDEST_SIGNALS = ['oldest', 'first', 'earliest', 'old one', 'initial'];
            const NEWEST_SIGNALS = ['newest', 'latest', 'most recent', 'last', 'new one', 'recent'];

            if (OLDEST_SIGNALS.some(s => hint.includes(s))) {
                const dream = await prisma.dream.findFirst({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, title: true },
                });
                if (dream) {
                    await logger.info('orchestrator', `[ENTITY] dreamId "oldest" → "${dream.title}"`, {});
                    resolved.dreamId = dream.id;
                    resolved._dreamTitle = dream.title;
                }
            } else if (NEWEST_SIGNALS.some(s => hint.includes(s))) {
                const dream = await prisma.dream.findFirst({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, title: true },
                });
                if (dream) {
                    await logger.info('orchestrator', `[ENTITY] dreamId "newest" → "${dream.title}"`, {});
                    resolved.dreamId = dream.id;
                    resolved._dreamTitle = dream.title;
                }
            } else {
                // Try vector similarity first
                const id = await resolveDream(userId, resolved.dreamId);
                if (id) {
                    const dream = await prisma.dream.findUnique({ where: { id }, select: { title: true } });
                    await logger.info('orchestrator', `[ENTITY] dreamId "${resolved.dreamId}" → "${dream?.title}" (vector)`, {});
                    resolved.dreamId = id;
                    if (dream) resolved._dreamTitle = dream.title;
                }
            }

            // ── Final validation: if still not a UUID, auto-fetch from DB ──
            if (!isValidUUID(resolved.dreamId)) {
                await logger.info('orchestrator', `[ENTITY] dreamId "${resolved.dreamId}" unresolved — auto-fetching dreams`, {});
                const allDreams = await prisma.dream.findMany({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, title: true },
                });
                if (allDreams.length === 1) {
                    // Only one dream — use it automatically
                    await logger.info('orchestrator', `[ENTITY] dreamId auto-resolved to only dream: "${allDreams[0].title}"`, {});
                    resolved.dreamId = allDreams[0].id;
                    resolved._dreamTitle = allDreams[0].title;
                } else if (allDreams.length > 1) {
                    // Multiple dreams — need user to pick. Clear dreamId so it lands in missingFields.
                    await logger.info('orchestrator', `[ENTITY] dreamId ambiguous — ${allDreams.length} dreams found, requesting disambiguation`, {});
                    resolved._dreamChoices = allDreams; // [{id, title}]
                    resolved.dreamId = undefined;       // force into missingFields
                } else {
                    // No active dreams
                    resolved.dreamId = undefined;
                }
            }
        }
    }

    // ── taskId ───────────────────────────────────────────────────────────────
    if (resolved.taskId && typeof resolved.taskId === 'string') {
        if (!isValidUUID(resolved.taskId)) {
            const hint = resolved.taskId.toLowerCase();
            const OLDEST = ['oldest', 'first', 'earliest'];
            const NEWEST = ['newest', 'latest', 'most recent', 'last', 'recent'];

            if (OLDEST.some(s => hint.includes(s))) {
                const task = await prisma.task.findFirst({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, title: true },
                });
                if (task) { resolved.taskId = task.id; resolved._taskTitle = task.title; }
            } else if (NEWEST.some(s => hint.includes(s))) {
                const task = await prisma.task.findFirst({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, title: true },
                });
                if (task) { resolved.taskId = task.id; resolved._taskTitle = task.title; }
            } else {
                const id = await resolveTask(userId, resolved.taskId);
                if (id) {
                    const task = await prisma.task.findUnique({ where: { id }, select: { title: true } });
                    resolved.taskId = id;
                    if (task) resolved._taskTitle = task.title;
                }
            }

            // Final validation
            if (resolved.taskId && !isValidUUID(resolved.taskId)) {
                const allTasks = await prisma.task.findMany({
                    where: { userId, status: { not: 'ARCHIVED' } },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, title: true },
                    take: 10,
                });
                if (allTasks.length === 1) {
                    resolved.taskId = allTasks[0].id;
                    resolved._taskTitle = allTasks[0].title;
                } else if (allTasks.length > 1) {
                    resolved._taskChoices = allTasks;
                    resolved.taskId = undefined;
                } else {
                    resolved.taskId = undefined;
                }
            }
        }
    }

    return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildConfirmSummary
// Converts args into a human-readable bullet list for confirmation display.
// ID fields are looked up by name. Internal _display fields are used when set.
// ─────────────────────────────────────────────────────────────────────────────
async function buildConfirmSummary(args: Record<string, any>): Promise<string> {
    const INTERNAL = new Set(['_dreamTitle', '_taskTitle', 'confirmed']); // stripped from output
    const lines: string[] = [];

    // Show resolved dream/task name instead of UUID
    if (args.dreamId) {
        const title = args._dreamTitle
            ?? (await prisma.dream.findUnique({ where: { id: args.dreamId }, select: { title: true } }))?.title
            ?? args.dreamId;
        lines.push(`• **Dream**: ${title}`);
    }
    if (args.taskId) {
        const title = args._taskTitle
            ?? (await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } }))?.title
            ?? args.taskId;
        lines.push(`• **Task**: ${title}`);
    }

    // All other non-internal, non-ID fields
    const SKIP = new Set(['dreamId', 'taskId', 'roadmapId', 'checkpointId', 'milestoneId', 'skillId', ...INTERNAL]);
    for (const [k, v] of Object.entries(args)) {
        if (!SKIP.has(k) && v !== null && v !== undefined && v !== '') {
            lines.push(`• **${k}**: ${v}`);
        }
    }

    return lines.length > 0 ? lines.join('\n') : '(no additional details)';
}


// ─────────────────────────────────────────────────────────────────────────────
// quickClassify
// Regex-based YES / NO classifier — zero LLM cost.
// Only falls through to LLM when the message is ambiguous (potential correction).
// NO regex: loosened to catch trailing pronouns/objects per production review.
// ─────────────────────────────────────────────────────────────────────────────
function quickClassify(msg: string): 'YES' | 'NO' | 'UNKNOWN' {
    const m = msg.trim().toLowerCase();
    const YES_RE = /^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|correct|looks good|proceed|create it|make it|approved|perfect|sounds good)[\s!.]*$/i;
    const NO_RE  = /^(no|nope|cancel( that| it| this)?|abort|stop( it| that| this)?|never mind|nevermind|don'?t( do it| do that| create)?)[\s!.]*$/i;
    if (YES_RE.test(m)) return 'YES';
    if (NO_RE.test(m))  return 'NO';
    return 'UNKNOWN';
}

function getDynamicRequiredFields(toolName: string, schemaRequired: string[], currentArgs: Record<string, any>): string[] {
    let required = [...schemaRequired];
    if (toolName === 'createTask' && currentArgs.deadline) {
        const deadline = new Date(currentArgs.deadline);
        if (!isNaN(deadline.getTime())) {
            const now = new Date();
            const start = currentArgs.startDate ? new Date(currentArgs.startDate) : now;
            // Normalize to midnight to calculate pure calendar days
            deadline.setHours(0, 0, 0, 0);
            start.setHours(0, 0, 0, 0);
            const diffTime = deadline.getTime() - start.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            // If task duration is 1 day or less, checkpoints are NOT required
            if (diffDays <= 1) {
                required = required.filter(f => f !== 'checkpoints');
            }
        }
    }
    return required;
}

async function detectIntent(message: string, history: any[]): Promise<{ intent: 'ACTION' | 'CHAT', complexity: 'SIMPLE' | 'COMPLEX', standalone_command?: string, usage?: any, ms?: number }> {
    const context = history.slice(-3).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const start = Date.now();
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `Analyze user request. Return JSON: {"intent": "ACTION"|"CHAT", "complexity": "SIMPLE"|"COMPLEX", "standalone_command": "..."}.

RULES:
1. ACTION: The user wants to do something with the system (create, update, delete, list, search, fetch, show, get). Examples: "list my dreams", "what are my tasks?", "create a dream", "cancel".
2. CHAT: The user is making casual conversation (greetings, jokes, general knowledge). Examples: "hello", "who are you?", "tell me a joke".

If intent is ACTION, "standalone_command" MUST be a fully resolved, standalone sentence explaining the exact action, replacing pronouns with their specific nouns from the history.
Example: If history is about 'AgroNexus Task' and user says 'Push it to Friday', standalone_command MUST be 'Push the AgroNexus task to Friday.'

CONTEXT:
${context}

REQUEST: ${message}`
                },
                { role: 'user', content: message }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 150,
            temperature: 0,
        }) as any;

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        const ms = Date.now() - start;
        return {
            intent: (parsed.intent === 'CHAT' ? 'CHAT' : 'ACTION'),
            complexity: parsed.complexity === 'COMPLEX' ? 'COMPLEX' : 'SIMPLE',
            standalone_command: parsed.standalone_command,
            usage: response.usage,
            ms
        };
    } catch {
        return { intent: 'ACTION', complexity: 'SIMPLE', ms: Date.now() - start };
    }
}

export const orchestrator = {
    async process(input: { userId: string, message: string, token: string }): Promise<ChatResponse> {
        const { userId, message, token } = input;
        const pipelineStart = Date.now();
        await logger.info('orchestrator', 'Pipeline START', { userId, msgLength: message.length });

        // 1. Save user msg
        await chatService.saveMessage(userId, 'user', message, null, null, null, new Date());

        // --- PHASE 4: STATE INTERCEPTOR ---
        const session = await prisma.actionSession.findUnique({ where: { userId } });

        // ── Double-tap guard: if session is currently being processed, queue the message ──
        // isProcessing is set to true while executeTool is running. A second message
        // arriving mid-execution would otherwise corrupt collectedFields.
        if (session && (session as any).isProcessing) {
            await logger.warn('orchestrator', '[LOCK] Session is processing — rejecting concurrent message', { userId });
            const text = "I'm still working on your last request. Give me just a moment! ⏳";
            await chatService.saveMessage(userId, 'assistant', text);
            return { text, responseMode: 'CHAT' };
        }
        if (session) {
            await logger.info('orchestrator', 'State Interceptor HIT', { status: session.status, targetTool: session.targetTool });

            // ── CANCELLATION INTERCEPT (before any LLM/service processing) ──────────────────────
            const CANCEL_RE = /\b(cancel|stop|abort|quit|exit|no|nope|never mind|nevermind|yes cancel|cancel it|cancel this|cancel that|cancel action|forget it|drop it|leave it|don'?t)\b/i;
            const quickResult = quickClassify(message);
            const looksLikeCancel = quickResult === 'NO' || CANCEL_RE.test(message.trim());

            if (looksLikeCancel) {
                await logger.info('orchestrator', 'User cancelled via intercept — deleting session', { tool: session.targetTool, message });
                await prisma.actionSession.delete({ where: { userId } });
                if (session.targetTool === 'syncDreamState') {
                    await dreamService.clearDraft(userId);
                }
                const cancelText = `No problem — **${session.targetTool}** cancelled. What would you like to do?`;
                await chatService.saveMessage(userId, 'assistant', cancelText);
                return { text: cancelText, responseMode: 'CHAT' };
            }

            // ── SERVICE-DRIVEN TOOLS: call the service immediately, let IT manage state ──
            // syncDreamState has a full Redis-backed slot-filling engine inside the service.
            // Groq's only job here is to translate user words → args. The service decides
            // what's missing, what's valid, and when to confirm.
            const SERVICE_DRIVEN_TOOLS = new Set(['syncDreamState']);

            if (SERVICE_DRIVEN_TOOLS.has(session.targetTool) && (session.status === 'SLOT_FILLING' || session.status === 'PENDING_CONFIRM')) {
                await logger.info('orchestrator', `[SERVICE-DRIVEN] Calling ${session.targetTool} directly`, {});

                // Groq: translate user message → args (translator only, no validation)
                const toolRecord = await prisma.toolRegistry.findUnique({ where: { name: session.targetTool } });
                const schema = toolRecord?.rawJsonSchema as any;
                const history = await chatService.getConversationWindow(userId, 5);
                const extRes = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a translation assistant. Your job is to extract JSON arguments for the tool "${session.targetTool}" from the user's latest message, using the chat history for context.
Parameter Schema: ${JSON.stringify(schema?.function?.parameters ?? {})}

You MUST return a JSON object with this shape:
{
  "extracted_fields": {},
  "is_diverting": false
}

CRITICAL RULES:
1. Analyze the chat history to understand which specific question/slot the user is answering with their latest message.
2. ONLY extract values that are explicitly provided or answered by the user in the latest message and put them in "extracted_fields". Do NOT invent or assume any values.
3. NEVER map answers to the wrong parameter (e.g. if the user is asked about their skill level, map "intermediate" to "currentSkillLevel", NOT to "title").
4. If the user said "yes", "confirm", "ok", or similar confirmation, set "confirmed" to true inside "extracted_fields".
5. For dates (deadline, startDate, targetDate), you MUST convert natural language or abbreviations into exact YYYY-MM-DD format. Assume today is ${new Date().toISOString().split('T')[0]}.
6. If the user ignores the slot-filling questions and starts a completely different topic (e.g. asking to create a task when they are currently in the middle of creating a dream), set "is_diverting" to true and leave "extracted_fields" as {}.`
                        },
                        ...history.map((h: any) => ({
                            role: h.role,
                            content: h.content
                        }))
                    ],
                    response_format: { type: 'json_object' },
                    max_tokens: 250,
                    temperature: 0,
                });
                const parsed = JSON.parse(extRes.choices[0]?.message?.content || '{}');
                const isDiverting = parsed.is_diverting === true;
                const extractedArgs = parsed.extracted_fields || {};
                await logger.info('orchestrator', `[SERVICE-DRIVEN] Groq extracted args`, { extractedArgs, isDiverting });

                if (isDiverting) {
                    await logger.info('orchestrator', 'Topic Diversion detected during service-driven tool — holding session', { tool: session.targetTool });
                    const text = `We're currently in the middle of **${session.targetTool}**. Would you like to cancel this and talk about your new topic, or finish this action first?`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }

                // Call the actual service/controller via the API adapter
                const result = await executeTool(session.targetTool, extractedArgs, token);
                await logger.info('orchestrator', `[SERVICE-DRIVEN] Service responded`, { status: result?.status });
                if (result?.status === 'COMPLETE') {
                    // Dream created ✅ — clean up session and celebrate
                    await prisma.actionSession.delete({ where: { userId } });
                    await invalidateContextCache(userId);
                    let text = `✅ Your dream has been created!`;
                    if (result.systemInstruction) {
                        const polishRes = await groq.chat.completions.create({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'system', content: `You are a friendly AI assistant helping create a dream. The system says: "${result.systemInstruction}". Translate this instruction into a warm, conversational message to the user. Do not expose developer notes or system directives.` }],
                            max_tokens: 120,
                            temperature: 0.7,
                        });
                        text = polishRes.choices[0]?.message?.content?.trim() ?? text;
                    }
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };

                } else if (result?.status === 'PENDING_CONFIRMATION') {
                    // All fields collected, service is asking for confirmation
                    await prisma.actionSession.update({ where: { userId }, data: { status: 'PENDING_CONFIRM' } });
                    const collected = result.collected ?? {};
                    const summary = Object.entries(collected)
                        .map(([k, v]) => `• **${k}**: ${v}`)
                        .join('\n');
                    const text = `Here's your dream:\n${summary}\n\nShall I create it now? (Yes / No)`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };

                } else if (result?.status === 'INCOMPLETE') {
                    // Service tells us exactly what's missing via systemInstruction
                    await prisma.actionSession.update({ where: { userId }, data: { status: 'SLOT_FILLING' } });
                    const instruction = result.systemInstruction ?? `I still need: ${(result.missingFields ?? []).join(', ')}`;
                    // Polish: turn the instruction into a warm natural question
                    const polishRes = await groq.chat.completions.create({
                        model: 'llama-3.1-8b-instant',
                        messages: [{ role: 'system', content: `You are a friendly AI assistant helping create a dream. ${instruction} Output only the single question sentence to ask the user.` }],
                        max_tokens: 80,
                        temperature: 0.7,
                    });
                    const text = polishRes.choices[0]?.message?.content?.trim() ?? instruction;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }

            }

            if (session.status === 'SLOT_FILLING') {

                // ── Fetch schema FIRST so we can tell the LLM which fields are missing ──
                const toolRecord = await prisma.toolRegistry.findUnique({ where: { name: session.targetTool } });
                const schema = toolRecord?.rawJsonSchema as any;
                const baseRequiredFields: string[] = schema?.function?.parameters?.required || [];
                const oldFields = (session.collectedFields as Record<string, any>) ?? {};
                const requiredFieldsBefore = getDynamicRequiredFields(session.targetTool, baseRequiredFields, oldFields);
                const missingBefore = requiredFieldsBefore.filter(f => !oldFields[f]);

                // ── STEP 4: Field Extraction — JSON-mode with Diversion Detection ─────
                const extStart = Date.now();
                const systemPromptBase = `You are a slot-filling assistant for the action "${session.targetTool}".
The user is being asked to provide these missing fields: ${missingBefore.join(', ')}.
Full parameter schema: ${JSON.stringify(schema?.function?.parameters ?? {})}.

Analyze the user's message and return a JSON object with EXACTLY this shape:
{
  "extracted_fields": {},
  "is_diverting": false,
  "needs_more_history": false
}

Rules:
- If the user's message directly answers one of the missing fields, set "is_diverting" to false and populate "extracted_fields" with any values you can extract.
- If the user ignores the missing fields, asks a completely unrelated question, or tries to change the subject entirely, set "is_diverting" to true and leave "extracted_fields" as {}.
- If you cannot resolve a pronoun (like "that one") from the provided chat history, set "needs_more_history" to true.
- CRITICAL: If a field is NOT explicitly provided by the user, DO NOT include it in the JSON. Omit the key entirely. Do not invent values or use the property name or generic terms (e.g. "dreamId", "taskId", "task", "dream", "my dream") as a value.
- CRITICAL: Do NOT extract command phrases, action verbs, or intent declarations (e.g. "create a task", "add new task", "create task", "make task") as the "title" or "description" of the task/dream. The "title" must only be extracted if the user explicitly specified what the task/dream is actually called (e.g. "Create task called Buy Groceries" -> title is "Buy Groceries").
- CRITICAL: Ensure every extracted field strictly matches the exact data type defined in the Schema (e.g., integers must be numbers, not strings).
- IMPORTANT: For dates (deadline, startDate, targetDate), you MUST convert natural language or abbreviations (e.g., "tomorrow", "nxt week", "next fri") into exact YYYY-MM-DD format. Assume today is ${new Date().toISOString().split('T')[0]}. Do NOT output words for date fields.

User message: "${message}"`;

                // Fetch 5 history messages for context by default
                let history = await chatService.getConversationWindow(userId, 5);
                let parsed = await extractWithAutoCorrection(systemPromptBase, history as any[], schema, true);
                
                // If LLM says it needs more history, fetch 15 messages and try again
                if (parsed.needs_more_history) {
                    await logger.info('orchestrator', '[SLOT_FILLING] LLM requested more history context. Re-fetching up to 15 messages.', {});
                    history = await chatService.getConversationWindow(userId, 15);
                    parsed = await extractWithAutoCorrection(systemPromptBase, history as any[], schema, true);
                }

                const extMs = Date.now() - extStart;
                await logger.info('orchestrator', 'Slot Extraction Pass (SLOT_FILLING)', { ms: extMs });

                const isDiverting: boolean = parsed.is_diverting === true;
                const newFields: Record<string, any> = parsed.extracted_fields ?? {};

                // ── TOPIC DIVERSION: Session is held, no state update ─────────────────
                if (isDiverting) {
                    await logger.info('orchestrator', 'Topic Diversion detected — holding session', { tool: session.targetTool });
                    const text = `We're currently in the middle of **${session.targetTool}**. Would you like to cancel this and talk about your new topic, or finish this action first?`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }

                // ── STEP 5: Merge & Resolve Entities ────────────────────────────────
                // Merge new fields into old ones first (ignoring empty values)
                const mergedFields: Record<string, any> = { ...oldFields };
                for (const [k, v] of Object.entries(newFields)) {
                    if (v !== null && v !== undefined && v !== '') {
                        mergedFields[k] = v;
                    }
                }

                // Resolve any entity IDs (dreamId, taskId) semantically
                let resolvedFields = await resolveEntityArgs(userId, mergedFields);
                let requiredFieldsAfter = getDynamicRequiredFields(session.targetTool, baseRequiredFields, resolvedFields);
                let missingFields = requiredFieldsAfter.filter(f => !resolvedFields[f]);

                // ── STEP 5.5: Autonomous Context Derivation ───────────────────────
                if (missingFields.length > 0) {
                    const derivationContext = await deriveMissingSlots(missingFields, token);
                    if (derivationContext) {
                        await logger.info('orchestrator', '[SLOT_FILLING] Re-running extraction with derived context', {});
                        const newSystemPrompt = systemPromptBase + derivationContext;
                        
                        // Re-extract using the new context
                        parsed = await extractWithAutoCorrection(newSystemPrompt, history as any[], schema, true);
                        
                        const reExtractedFields = parsed.extracted_fields ?? {};
                        for (const [k, v] of Object.entries(reExtractedFields)) {
                            if (v !== null && v !== undefined && v !== '') {
                                mergedFields[k] = v;
                            }
                        }
                        
                        // Re-resolve
                        resolvedFields = await resolveEntityArgs(userId, mergedFields);
                        requiredFieldsAfter = getDynamicRequiredFields(session.targetTool, baseRequiredFields, resolvedFields);
                        missingFields = requiredFieldsAfter.filter(f => !resolvedFields[f]);
                    }
                }

                if (missingFields.length > 0) {
                    await logger.info('orchestrator', 'Missing fields remain after merge, resolution & derivation', { missingFields, resolvedFields });
                    await prisma.actionSession.update({ where: { userId }, data: { collectedFields: resolvedFields } });

                    // ── STEP 6: Conversational Polish ─────────────────────────────────
                    const nextMissing = missingFields[0];
                    let disambiguationContext = '';
                    if (nextMissing === 'dreamId' && resolvedFields._dreamChoices) {
                        disambiguationContext = `NOTE: Multiple dreams were found. Ask the user to pick one from this list:\n` + 
                            resolvedFields._dreamChoices.map((d: any, i: number) => `${i+1}. ${d.title}`).join('\n');
                    } else if (nextMissing === 'taskId' && resolvedFields._taskChoices) {
                        disambiguationContext = `NOTE: Multiple tasks were found. Ask the user to pick one from this list:\n` + 
                            resolvedFields._taskChoices.map((t: any, i: number) => `${i+1}. ${t.title}`).join('\n');
                    }

                    const polishStart = Date.now();
                    const polishResponse = await groq.chat.completions.create({
                        model: 'llama-3.1-8b-instant',
                        messages: [{
                            role: 'system',
                            content: `You are a warm, friendly AI assistant completing the action "${session.targetTool}" for the user.
Already collected: ${JSON.stringify(resolvedFields)}.
The next missing piece of information needed is: "${nextMissing}".
${disambiguationContext}
Write ONE short, natural, conversational question asking the user for "${nextMissing}".
If disambiguation context is provided, list the options naturally.
Be warm and human. Output only the question — no preamble, no explanation.`
                        }],
                        max_tokens: 150,
                        temperature: 0.7,
                    });
                    
                    await logger.info('orchestrator', 'Conversational Polish Pass', {
                        ms: Date.now() - polishStart,
                        tokens: polishResponse.usage?.total_tokens
                    });

                    const text = polishResponse.choices[0]?.message?.content?.trim()
                        ?? `Could you also share the ${nextMissing}?`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                } else if (SKIP_CONFIRMATION_TOOLS.has(session.targetTool)) {
                    await logger.info('orchestrator', 'Tool skips confirmation — executing immediately', { tool: session.targetTool });
                    const result = await executeTool(session.targetTool, resolvedFields, token);
                    await prisma.actionSession.delete({ where: { userId } });
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(session.targetTool, result, message);
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };
                } else {
                    await logger.info('orchestrator', 'All fields collected, moving to PENDING_CONFIRM', { resolvedFields });
                    await prisma.actionSession.update({ where: { userId }, data: { collectedFields: resolvedFields, status: 'PENDING_CONFIRM' } });
                    const confirmSummary = await buildConfirmSummary(resolvedFields);
                    const text = `Got everything I need. Here's a summary of what I'll do:\n${confirmSummary}\n\nShall I go ahead? (Yes / No)`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }
            } else if (session.status === 'PENDING_CONFIRM') {
                // ── Step 1: Regex quick-classify — zero LLM cost for YES/NO ──────────
                const quick = quickClassify(message);
                await logger.info('orchestrator', `[PENDING_CONFIRM] quickClassify="${quick}" for tool="${session.targetTool}"`, {});

                if (quick === 'YES') {
                    // Lock the session while executing to prevent double-tap
                    await prisma.actionSession.update({ where: { userId }, data: { isProcessing: true } as any });
                    const execStart = Date.now();
                    const resolvedFields = await resolveEntityArgs(userId, session.collectedFields as Record<string, any>);
                    const result = await executeTool(session.targetTool, resolvedFields, token);
                    await logger.info('orchestrator', '[PENDING_CONFIRM] Tool executed', { ms: Date.now() - execStart, tool: session.targetTool });
                    await prisma.actionSession.delete({ where: { userId } });
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(session.targetTool, result, message);
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };

                } else if (quick === 'NO') {
                    await logger.info('orchestrator', '[PENDING_CONFIRM] Aborted by user (regex NO)', { tool: session.targetTool });
                    await prisma.actionSession.delete({ where: { userId } });
                    const text = `No problem — action cancelled. Let me know if there's anything else I can help you with.`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };

                } else {
                    // UNKNOWN — could be a CORRECTION. Call LLM only for this case.
                    await logger.info('orchestrator', '[PENDING_CONFIRM] UNKNOWN — calling LLM to classify (may be CORRECTION)', {});
                    const toolRecord = await prisma.toolRegistry.findUnique({ where: { name: session.targetTool } });
                    const schema = toolRecord?.rawJsonSchema as any;
                    const systemPromptBase = `Classify the user reply during confirmation for action "${session.targetTool}".
Collected: ${JSON.stringify(session.collectedFields)}.
Schema: ${JSON.stringify(schema?.function?.parameters ?? {})}.
User said: "${message}"
Return JSON: { "intent": "YES"|"NO"|"CORRECTION", "corrected_fields": {} }
- YES: confirms to proceed.
- NO: cancels.
- CORRECTION: user is fixing a specific field. Extract corrected_fields.
CRITICAL: corrected_fields MUST strictly match the exact data type defined in the Schema. For dates, you MUST convert natural language into exact YYYY-MM-DD format based on today (${new Date().toISOString().split('T')[0]}). Do NOT output words for dates.
Output only valid JSON.`;

                    let classificationAttempts = 0;
                    let correctionPrompt = '';
                    let classified: any = {};
                    let pcIntent: 'YES' | 'NO' | 'CORRECTION' = 'NO';
                    
                    while (classificationAttempts < 3) {
                        classificationAttempts++;
                        const systemPrompt = correctionPrompt ? `${systemPromptBase}\n\nCRITICAL FIX REQUIRED:\n${correctionPrompt}` : systemPromptBase;
                        
                        const classifyRes = await groq.chat.completions.create({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'system', content: systemPrompt }],
                            response_format: { type: 'json_object' },
                            max_tokens: 150,
                            temperature: 0,
                        });
                        classified = JSON.parse(classifyRes.choices[0]?.message?.content || '{}');
                        pcIntent = classified.intent as 'YES' | 'NO' | 'CORRECTION';
                        
                        if (pcIntent === 'CORRECTION' && classified.corrected_fields) {
                            const errors = validateExtractedTypes(classified.corrected_fields, schema);
                            if (errors.length > 0) {
                                correctionPrompt = `Errors found in corrected_fields:\n` + errors.map((e, i) => `${i+1}. ${e}`).join('\n') + `\nFix ALL these errors and output the full JSON again.`;
                                await logger.warn('orchestrator', `PENDING_CONFIRM type mismatch (Attempt ${classificationAttempts})`, { errors });
                                continue;
                            }
                        }
                        
                        await logger.info('orchestrator', `[PENDING_CONFIRM] LLM classified: ${pcIntent}`, { tool: session.targetTool, tokens: classifyRes.usage?.total_tokens });
                        break; // valid
                    }

                    if (pcIntent === 'YES') {
                        await prisma.actionSession.update({ where: { userId }, data: { isProcessing: true } as any });
                        const execStart = Date.now();
                        const resolvedFields = await resolveEntityArgs(userId, session.collectedFields as Record<string, any>);
                        const result = await executeTool(session.targetTool, resolvedFields, token);
                        await logger.info('orchestrator', '[PENDING_CONFIRM] Tool executed (LLM YES)', { ms: Date.now() - execStart });
                        await prisma.actionSession.delete({ where: { userId } });
                        await invalidateContextCache(userId);
                        const text = await naturalizeResult(session.targetTool, result, message);
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'SUCCESS' };

                    } else if (pcIntent === 'CORRECTION') {
                        const corrected: Record<string, any> = classified.corrected_fields ?? {};
                        const oldFields = (session.collectedFields as Record<string, any>) ?? {};
                        let mergedFields: Record<string, any> = { ...oldFields };
                        for (const [k, v] of Object.entries(corrected)) {
                            if (v !== null && v !== undefined && v !== '') mergedFields[k] = v;
                        }
                        mergedFields = await resolveEntityArgs(userId, mergedFields);
                        await logger.info('orchestrator', '[PENDING_CONFIRM] Correction merged', { corrected, mergedFields });
                        await prisma.actionSession.update({
                            where: { userId },
                            data: { collectedFields: mergedFields, status: 'PENDING_CONFIRM' },
                        });
                        const HIDE_FIELDS = new Set(['dreamId', 'taskId', 'roadmapId', 'checkpointId']);
                        const readableSummary = Object.entries(mergedFields)
                            .filter(([k]) => !HIDE_FIELDS.has(k))
                            .map(([k, v]) => `• **${k}**: ${v}`)
                            .join('\n');
                        const text = `Got it — here's the updated summary:\n${readableSummary}\n\nShall I go ahead now? (Yes / No)`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };

                    } else {
                        await logger.info('orchestrator', '[PENDING_CONFIRM] Aborted by user (LLM NO)', { tool: session.targetTool });
                        await prisma.actionSession.delete({ where: { userId } });
                        const text = `No problem — action cancelled. Let me know if there's anything else I can help you with.`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };
                    }
                }
            }
        }

        await logger.info('orchestrator', 'No active session, proceeding to Gatekeeper', {});

        // 2. Load context
        let history = await chatService.getConversationWindow(userId, 5);
        let name = 'there', motivationTone = 'NEUTRAL', contextBlock = '', agentName = 'IgniteMate';
    
        try {
            const ctx = await buildUserContext(token, userId);
            name = ctx.name;
            agentName = ctx.agentName || 'IgniteMate';
            motivationTone = ctx.motivationTone;
            contextBlock = ctx.contextBlock;
        } catch (err: any) {
            await logger.warn('orchestrator', 'Context build failed', { err: err.message });
        }

        // 3. System Prompt & Intent
        const systemMsg: ChatMessage = { role: 'system', content: buildSystemPrompt(contextBlock, motivationTone, name) };
        const intentResult = await detectIntent(message, history);
        const { intent, complexity, standalone_command, ms: intentMs, usage: intentUsage } = intentResult;

        await logger.info('orchestrator', `Gatekeeper Pass: ${intent}`, {
            ms: intentMs,
            tokens: intentUsage?.total_tokens,
            standalone_command
        });
        
        let routerStatus = 'N/A';
        
        if (intent === 'ACTION') {
            const queryMessage = standalone_command || message;
            const routerStart = Date.now();
            const routerResult = await getRelevantTools(queryMessage);
            const routerMs = Date.now() - routerStart;
            routerStatus = routerResult.status;

            await logger.info('orchestrator', `Router Pass: ${routerStatus}`, { ms: routerMs });
            
            if (routerResult.status === 'SUCCESS') {
                const toolSchema = routerResult.tool;
                
                const extStart = Date.now();
                const systemPromptBase = `Extract JSON arguments for tool ${toolSchema.function.name}. Schema: ${JSON.stringify(toolSchema.function.parameters)}. User message: ${queryMessage}. Return a JSON object with extracted fields ONLY.

CRITICAL RULES:
1. If a field is NOT explicitly mentioned in the user message, DO NOT include it in the JSON output. Omit it entirely!
2. Do NOT invent values, and do NOT use property names or placeholder text (e.g. "dreamId", "taskId", "task", "dream", "my dream") as values for ID/UUID fields. If a real UUID or entity name/reference is not provided, omit that ID field entirely.
3. Do NOT extract command phrases, action verbs, or intent declarations (e.g. "create a task", "add new task", "create task", "make task") as the "title" or "description" of the task/dream. The "title" must only be extracted if the user explicitly specified what the task/dream is actually called (e.g. "Create task called Buy Groceries" -> title is "Buy Groceries").
4. Every extracted field MUST strictly match the exact data type defined in the Schema (e.g., integers must be numbers).
5. For dates (deadline, startDate, targetDate), you MUST convert natural language or abbreviations into exact YYYY-MM-DD format based on today (${new Date().toISOString().split('T')[0]}). Do NOT output words for date fields.`;

                const extractedArgs = await extractWithAutoCorrection(systemPromptBase, history as any[], toolSchema, false);

                const extMs = Date.now() - extStart;
                await logger.info('orchestrator', 'Slot Extraction Pass (SUCCESS)', { ms: extMs });
                await logger.info('orchestrator', '[SLOT EXTRACT] Raw LLM args', { extractedArgs });
                let resolvedArgs = await resolveEntityArgs(userId, extractedArgs);
                await logger.info('orchestrator', '[SLOT EXTRACT] After entity resolution', { resolvedArgs });

                const baseRequiredFields: string[] = toolSchema.function.parameters?.required || [];
                let requiredFieldsAfter = getDynamicRequiredFields(toolSchema.function.name, baseRequiredFields, resolvedArgs);
                let missingFields = requiredFieldsAfter.filter(f => !resolvedArgs[f]);

                // ── Autonomous Context Derivation ───────────────────────
                if (missingFields.length > 0) {
                    const derivationContext = await deriveMissingSlots(missingFields, token);
                    if (derivationContext) {
                        await logger.info('orchestrator', '[GATEKEEPER] Re-running extraction with derived context', {});
                        const newSystemPrompt = systemPromptBase + derivationContext;
                        
                        // Re-extract using the new context
                        const reExtractedArgs = await extractWithAutoCorrection(newSystemPrompt, history as any[], toolSchema, false);
                        
                        // Re-resolve
                        resolvedArgs = await resolveEntityArgs(userId, reExtractedArgs);
                        requiredFieldsAfter = getDynamicRequiredFields(toolSchema.function.name, baseRequiredFields, resolvedArgs);
                        missingFields = requiredFieldsAfter.filter(f => !resolvedArgs[f]);
                    }
                }

                // ── SERVICE-DRIVEN TOOLS: route to the service immediately ────────
                // These tools manage their own state (Redis etc.) — just call them.
                // For syncDreamState: ActionSession only tracks status+targetTool.
                // The Redis dream:draft:{userId} inside dreamService is the single source of truth for collectedFields.
                const SERVICE_DRIVEN_TOOLS_INIT = new Set(['syncDreamState']);

                if (SERVICE_DRIVEN_TOOLS_INIT.has(toolSchema.function.name)) {
                    await logger.info('orchestrator', `[SERVICE-DRIVEN INIT] Creating session and calling ${toolSchema.function.name} directly`, {});
                    // ✅ collectedFields intentionally empty for service-driven tools — Redis is source of truth
                    await prisma.actionSession.upsert({
                        where: { userId },
                        update: { targetTool: toolSchema.function.name, status: 'SLOT_FILLING', collectedFields: {} },
                        create: { userId, targetTool: toolSchema.function.name, status: 'SLOT_FILLING', collectedFields: {} }
                    });
                    // Call the service immediately with whatever was extracted
                    const result = await executeTool(toolSchema.function.name, resolvedArgs, token);
                    await logger.info('orchestrator', `[SERVICE-DRIVEN INIT] Service responded`, { status: result?.status });

                    if (result?.status === 'COMPLETE') {
                        await prisma.actionSession.delete({ where: { userId } });
                        await invalidateContextCache(userId);
                        const text = result.systemInstruction ?? `✅ Done! Dream created (ID: ${result.dreamId}).`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'SUCCESS' };

                    } else if (result?.status === 'PENDING_CONFIRMATION') {
                        await prisma.actionSession.update({ where: { userId }, data: { status: 'PENDING_CONFIRM' } });
                        const collected = result.collected ?? {};
                        const summary = Object.entries(collected).map(([k, v]) => `• **${k}**: ${v}`).join('\n');
                        const text = `Here's your dream:\n${summary}\n\nShall I create it now? (Yes / No)`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };

                    } else if (result?.status === 'INCOMPLETE') {
                        const instruction = result.systemInstruction ?? `I still need: ${(result.missingFields ?? []).join(', ')}`;
                        const polishRes = await groq.chat.completions.create({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'system', content: `You are a friendly AI helping create a dream. ${instruction} Output only a single warm question sentence to ask the user.` }],
                            max_tokens: 80,
                            temperature: 0.7,
                        });
                        const text = polishRes.choices[0]?.message?.content?.trim() ?? instruction;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };

                    } else if (result?.error) {
                        await prisma.actionSession.delete({ where: { userId } });
                        const text = `Something went wrong: ${result.error}`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };
                    }

                    const text = 'Could you share more details about your dream?';
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }

                if (missingFields.length > 0) {
                    // Some required fields are missing — start slot-filling
                    await logger.info('orchestrator', '[SLOT_FILLING] Creating session', { tool: toolSchema.function.name, missingFields, resolvedArgs });
                    // ✅ upsert prevents race condition when user sends two messages rapidly
                    await prisma.actionSession.upsert({
                        where: { userId },
                        update: { targetTool: toolSchema.function.name, status: 'SLOT_FILLING', collectedFields: resolvedArgs },
                        create: { userId, targetTool: toolSchema.function.name, status: 'SLOT_FILLING', collectedFields: resolvedArgs }
                    });

                    const nextMissing = missingFields[0];
                    let disambiguationContext = '';
                    if (nextMissing === 'dreamId' && resolvedArgs._dreamChoices) {
                        disambiguationContext = `NOTE: Multiple dreams were found. Ask the user to pick one from this list:\n` + 
                            resolvedArgs._dreamChoices.map((d: any, i: number) => `${i+1}. ${d.title}`).join('\n');
                    } else if (nextMissing === 'taskId' && resolvedArgs._taskChoices) {
                        disambiguationContext = `NOTE: Multiple tasks were found. Ask the user to pick one from this list:\n` + 
                            resolvedArgs._taskChoices.map((t: any, i: number) => `${i+1}. ${t.title}`).join('\n');
                    }

                    // Conversational Polish: ask naturally for first missing field
                    const polishRes = await groq.chat.completions.create({
                        model: 'llama-3.1-8b-instant',
                        messages: [{
                            role: 'system',
                            content: `You are a friendly AI assistant. The user wants to "${toolSchema.function.name}".
Already collected: ${JSON.stringify(resolvedArgs)}.
You need "${nextMissing}" to proceed.
${disambiguationContext}
Ask a short, warm, natural question for it. Output only the question.`
                        }],
                        max_tokens: 150,
                        temperature: 0.7,
                    });
                    const text = polishRes.choices[0]?.message?.content?.trim()
                        ?? `To proceed, could you share the ${nextMissing}?`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };

                } else if (requiredFieldsAfter.length === 0) {
                    // Zero-required tool (listDreams, getDashboard etc.) — execute immediately
                    await logger.info('orchestrator', 'Zero-required tool — executing immediately', { tool: toolSchema.function.name });
                    const result = await executeTool(toolSchema.function.name, extractedArgs, token);
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(toolSchema.function.name, result, standalone_command || message);
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };

                } else if (SKIP_CONFIRMATION_TOOLS.has(toolSchema.function.name)) {
                    await logger.info('orchestrator', 'Tool skips confirmation — executing immediately', { tool: toolSchema.function.name });
                    const result = await executeTool(toolSchema.function.name, resolvedArgs, token);
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(toolSchema.function.name, result, standalone_command || message);
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };
                } else {
                    // All required fields present — resolvedArgs already has entity-resolved UUIDs
                    await logger.info('orchestrator', '[PENDING_CONFIRM] All fields present, creating confirmation session', { tool: toolSchema.function.name, resolvedArgs });
                    // ✅ upsert prevents race condition
                    await prisma.actionSession.upsert({
                        where: { userId },
                        update: { targetTool: toolSchema.function.name, status: 'PENDING_CONFIRM', collectedFields: resolvedArgs },
                        create: { userId, targetTool: toolSchema.function.name, status: 'PENDING_CONFIRM', collectedFields: resolvedArgs }
                    });
                    const confirmSummary = await buildConfirmSummary(resolvedArgs);
                    const text = `Here's what I'll do:\n${confirmSummary}\n\nShall I go ahead? (Yes / No)`;
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'CHAT' };
                }
            } else if (routerResult.status === 'AMBIGUOUS') {
                const topTool = routerResult.topTool;
                const secondTool = routerResult.secondTool;
                const topName: string = topTool?.function?.name ?? '';
                const secondName: string = secondTool?.function?.name ?? '';

                // ── Read-only: safe to execute the top scorer immediately ──────────
                const READ_ONLY_TOOLS = new Set([
                    'searchTasks', 'listTasks', 'getTask',
                    'searchDreams', 'listDreams', 'getDream',
                    'getDashboard', 'listSprints', 'getSprint',
                    'getPreferences', 'listNotifications',
                    'getRoadmap', 'listRoadmaps',
                ]);

                if (topName && READ_ONLY_TOOLS.has(topName)) {
                    await logger.info('orchestrator', `[AMBIGUOUS→EXECUTE] read-only "${topName}" — executing directly`, { candidates: routerResult.candidates });
                    const result = await executeTool(topName, {}, token);
                    await invalidateContextCache(userId);
                    const text = await naturalizeResult(topName, result, standalone_command || message);
                    await chatService.saveMessage(userId, 'assistant', text);
                    return { text, responseMode: 'SUCCESS' };
                }

                // ── Write-write tiebreaker by domain keyword ──────────────────────
                // "create a new dream" vs "create a task" — both embed close together.
                // Use the user's own words to break the tie, no LLM call needed.
                const DREAM_TOOLS  = new Set(['syncDreamState', 'updateDream', 'completeDream', 'failDream', 'archiveDream']);
                const TASK_TOOLS_W = new Set(['createTask', 'updateTask', 'completeTask', 'blockTask', 'archiveTask', 'updateTaskProgress']);
                const ROADMAP_TOOLS_W = new Set(['generateRoadmap', 'activateRoadmap']);

                const queryLower = `${standalone_command} ${queryMessage}`.toLowerCase();
                const mentionsDream   = /\bdream\b/.test(queryLower);
                const mentionsTask    = /\btask\b/.test(queryLower);
                const mentionsRoadmap = /\broadmap\b/.test(queryLower);

                let resolvedTool: any = null;

                if (mentionsDream && !mentionsTask) {
                    resolvedTool = DREAM_TOOLS.has(topName)   ? topTool
                                 : DREAM_TOOLS.has(secondName) ? secondTool
                                 : null;
                } else if (mentionsTask && !mentionsDream) {
                    resolvedTool = TASK_TOOLS_W.has(topName)   ? topTool
                                 : TASK_TOOLS_W.has(secondName) ? secondTool
                                 : null;
                } else if (mentionsRoadmap) {
                    resolvedTool = ROADMAP_TOOLS_W.has(topName)   ? topTool
                                 : ROADMAP_TOOLS_W.has(secondName) ? secondTool
                                 : null;
                }

                if (resolvedTool) {
                    // ── Keyword tiebreak succeeded: run the same slot-filling flow as SUCCESS ──
                    await logger.info('orchestrator', `[AMBIGUOUS→KEYWORD_RESOLVE] picked "${resolvedTool.function.name}" via domain keyword`, { candidates: routerResult.candidates });

                    const extStart = Date.now();
                    const systemPromptBase = `Extract JSON arguments for tool ${resolvedTool.function.name}. Schema: ${JSON.stringify(resolvedTool.function.parameters)}. User message: ${queryMessage}. Return a JSON object with extracted fields ONLY. CRITICAL: If a field is NOT explicitly mentioned in the user message, DO NOT include it in the JSON output. Omit it entirely! Do not invent values or use property names as values. CRITICAL: Every extracted field MUST strictly match the exact data type defined in the Schema (e.g., integers must be numbers). IMPORTANT: For dates (deadline, startDate, targetDate), convert natural language or abbreviations ("tomorrow", "nxt week", "end of month") to exact YYYY-MM-DD format based on today (${new Date().toISOString().split('T')[0]}). Do NOT output words for dates.`;
                    
                    const extractedArgs = await extractWithAutoCorrection(systemPromptBase, history as any[], resolvedTool, false);
                    await logger.info('orchestrator', 'Slot Extraction (AMBIGUOUS resolved)', { ms: Date.now() - extStart });
                    let resolvedArgs = await resolveEntityArgs(userId, extractedArgs);
                    const requiredFields: string[] = resolvedTool.function.parameters?.required || [];
                    let missingFields = requiredFields.filter(f => !resolvedArgs[f]);

                    // ── Autonomous Context Derivation ───────────────────────
                    if (missingFields.length > 0) {
                        const derivationContext = await deriveMissingSlots(missingFields, token);
                        if (derivationContext) {
                            await logger.info('orchestrator', '[GATEKEEPER AMBIGUOUS] Re-running extraction with derived context', {});
                            const newSystemPrompt = systemPromptBase + derivationContext;
                            
                            // Re-extract using the new context
                            const reExtractedArgs = await extractWithAutoCorrection(newSystemPrompt, history as any[], resolvedTool, false);
                            
                            // Re-resolve
                            resolvedArgs = await resolveEntityArgs(userId, reExtractedArgs);
                            missingFields = requiredFields.filter(f => !resolvedArgs[f]);
                        }
                    }

                    if (missingFields.length > 0) {
                        await prisma.actionSession.create({
                            data: { userId, targetTool: resolvedTool.function.name, status: 'SLOT_FILLING', collectedFields: resolvedArgs }
                        });

                        const nextMissing = missingFields[0];
                        let disambiguationContext = '';
                        if (nextMissing === 'dreamId' && resolvedArgs._dreamChoices) {
                            disambiguationContext = `NOTE: Multiple dreams were found. Ask the user to pick one from this list:\n` + 
                                resolvedArgs._dreamChoices.map((d: any, i: number) => `${i+1}. ${d.title}`).join('\n');
                        } else if (nextMissing === 'taskId' && resolvedArgs._taskChoices) {
                            disambiguationContext = `NOTE: Multiple tasks were found. Ask the user to pick one from this list:\n` + 
                                resolvedArgs._taskChoices.map((t: any, i: number) => `${i+1}. ${t.title}`).join('\n');
                        }

                        const polishRes = await groq.chat.completions.create({
                            model: 'llama-3.1-8b-instant',
                            messages: [{
                                role: 'system',
                                content: `You are a friendly assistant. The user wants to "${resolvedTool.function.name}".
Already collected: ${JSON.stringify(resolvedArgs)}.
You need "${nextMissing}" to proceed.
${disambiguationContext}
Ask a short, warm, natural question for it. Output only the question.`
                            }],
                            max_tokens: 150,
                            temperature: 0.7,
                        });
                        const text = polishRes.choices[0]?.message?.content?.trim()
                            ?? `To proceed, could you share the ${nextMissing}?`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };

                    } else if (requiredFields.length === 0) {
                        const result = await executeTool(resolvedTool.function.name, resolvedArgs, token);
                        await invalidateContextCache(userId);
                        const text = await naturalizeResult(resolvedTool.function.name, result, standalone_command || message);
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'SUCCESS' };

                    } else if (SKIP_CONFIRMATION_TOOLS.has(resolvedTool.function.name)) {
                        await logger.info('orchestrator', 'Tool skips confirmation — executing immediately', { tool: resolvedTool.function.name });
                        const result = await executeTool(resolvedTool.function.name, resolvedArgs, token);
                        await invalidateContextCache(userId);
                        const text = await naturalizeResult(resolvedTool.function.name, result, standalone_command || message);
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'SUCCESS' };
                    } else {
                        await prisma.actionSession.create({
                            data: { userId, targetTool: resolvedTool.function.name, status: 'PENDING_CONFIRM', collectedFields: resolvedArgs }
                        });
                        const confirmSummary = await buildConfirmSummary(resolvedArgs);
                        const text = `Ready to go! Here's what I'll do:\n${confirmSummary}\n\nShall I proceed? (Yes / No)`;
                        await chatService.saveMessage(userId, 'assistant', text);
                        return { text, responseMode: 'CHAT' };
                    }
                }

                // ── No domain signal → genuinely ambiguous write-write, ask for clarification ──
                await logger.info('orchestrator', `[AMBIGUOUS→CLARIFY] "${topName}" vs "${secondName}" — no keyword signal`, {});
                systemMsg.content += `\n\nThe user requested an action, but it is ambiguous between [${routerResult.candidates[0]}] and [${routerResult.candidates[1]}]. Ask the user to clarify exactly which one they want to perform.`;
            }
        }

        // 4. Agentic Loop (Fallback for CHAT, NO_MATCH, or AMBIGUOUS)
        await logger.info('orchestrator', 'Entering Agentic Loop', { complexity });
        const messages: ChatMessage[] = [systemMsg, ...history as any[]];
        const MAX_ITERATIONS = 5;

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            let response: any;
            try {
                response = await executeWithFallback(messages, { complexity, tools: [], max_tokens: 1500 }, iteration);
            } catch (error: any) {
                await logger.error('orchestrator', 'Fallback Exhausted', { error: error.message });
                const errText = 'I am having trouble reaching my brain components. Please try again.';
                await chatService.saveMessage(userId, 'assistant', errText);
                return { text: errText, responseMode: 'ERROR' };
            }

            const aiMessage = response.choices[0]?.message;
            if (!aiMessage) break;

            const text = aiMessage.content?.trim() || "I'm not sure how to respond to that.";
            await chatService.saveMessage(userId, 'assistant', text);

            if (!notificationWS.hasActiveClients(userId)) {
                await pushService.sendPushNotification(userId, {
                    title: agentName,
                    body: text,
                    data: { url: '/app/home' }
                }).catch(err => logger.warn('orchestrator', 'Push fallback failed', { err: err.message }));
            }

            await logger.info('orchestrator', 'Pipeline FINISHED', { totalMs: Date.now() - pipelineStart });
            return { text, responseMode: 'CHAT' };
        }

        const timeoutMsg = "I worked on your request but timed out before I could finish. Please check your tasks.";
        await chatService.saveMessage(userId, 'assistant', timeoutMsg);
        return { text: timeoutMsg, responseMode: 'ERROR' };
    },
};
