// src/ai/intentDetector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Classifies a user message into a { mode, intent } pair.
// Temperature = 0.1 for deterministic, consistent classification.
// Output is validated with Zod before use.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { VALID_INTENTS, MODES, IntentName } from './registry/intentRegistry';

const IntentResponseSchema = z.object({
    mode: z.enum([MODES.ACTION, MODES.QUERY, MODES.CHAT]),
    intent: z.string().refine(
        (v) => VALID_INTENTS.includes(v as IntentName),
        { message: 'Invalid intent name' }
    ),
});

export type IntentResult = z.infer<typeof IntentResponseSchema>;

const SYSTEM_PROMPT = `You are an intent classifier for DreamPlanner, a goal-tracking productivity app.

Classify the user message into EXACTLY ONE intent from the list below.
Return ONLY a JSON object with no markdown, no explanation.

MODES:
- ACTION: user wants to create/update/delete/complete/confirm/cancel data
- QUERY: user wants to read/view/list data
- CHAT: general conversation, questions about how to use the app, greetings

VALID INTENTS:
${VALID_INTENTS.join(', ')}

SYSTEM / FLOW-CONTROL INTENTS — check these FIRST, before any domain intent:
- CANCEL_DRAFT    → user wants to stop / abort / cancel what they were doing.
                    Triggers: "cancel", "stop", "forget it", "never mind", "abort", "start over", "scratch that".
- CONFIRM_YES     → user is saying yes to a confirmation prompt or abort question.
                    Triggers: "yes", "yep", "yeah", "sure", "ok", "okay", "do it", "go ahead", "proceed", "confirm".
- CONFIRM_NO      → user is saying no to a confirmation prompt or abort question.
                    Triggers: "no", "nope", "don't", "keep going", "continue", "ignore that".
- SKIP_FIELD      → user wants to skip / leave blank the field currently being asked.
                    Triggers: "skip", "none", "leave it blank", "no description", "don't need it", "not now", "pass".

DOMAIN INTENT RULES (only if none of the flow-control intents match):
 1. "delete checkpoint"            → DELETE_CHECKPOINT
 2. "edit checkpoint"              → UPDATE_CHECKPOINT
 3. "log progress on checkpoint"   → UPDATE_CHECKPOINT_PROGRESS
 4. "show my tasks"                → LIST_TASKS  (QUERY mode)
 5. "complete task"                → COMPLETE_TASK
 6. "archive task" / "delete task" → ARCHIVE_TASK
 7. "create dream"                 → CREATE_DREAM_DRAFT  (not CONFIRM_DREAM)
 8. Analytics questions            → GET_DASHBOARD | GET_SPRINT | LIST_SPRINTS
 9. "change my reminder tone"      → UPDATE_PREFERENCES
10. Anything else unclear          → GENERAL_CHAT

OUTPUT FORMAT (strict JSON, no markdown):
{"mode": "ACTION", "intent": "CREATE_TASK"}`;

export const intentDetector = {
    async detect(message: string, history: { role: string; content: string }[]): Promise<IntentResult> {
        try {
            const messages: any[] = [
                { role: 'system', content: SYSTEM_PROMPT },
                // Inject last 3 history messages for conversational context
                ...history.slice(-3).map((m) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
            ];

            const response = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages,
                temperature: 0.1,
                max_tokens: 60,
                response_format: { type: 'json_object' },
            });

            const raw = response.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw);
            const validated = IntentResponseSchema.parse(parsed);
            return validated;

        } catch (error: any) {
            await logger.error('ai-intent', 'Intent detection failed, falling back to GENERAL_CHAT', {
                error: error.message,
            });
            return { mode: MODES.CHAT, intent: 'GENERAL_CHAT' };
        }
    },
};
