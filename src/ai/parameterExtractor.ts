// src/ai/parameterExtractor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Extracts concrete API parameters from a natural-language message.
// Uses the INTENT_REGISTRY to know which fields are required/optional.
// LLM output is Zod-validated before it touches the draft.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { INTENT_REGISTRY, IntentName } from './registry/intentRegistry';
import { UserContext } from './contextBuilder';

export interface ExtractionResult {
    parameters: Record<string, any>;
    missingFields: string[];
}

// ── Build a per-intent zod schema from the registry ──────────────────────────
function buildLooseSchema(intent: IntentName): z.ZodObject<any> {
    const def = INTENT_REGISTRY[intent];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of def.required) {
        shape[field] = z.any().nullable();
    }
    for (const field of def.optional) {
        shape[field] = z.any().nullable().optional();
    }
    return z.object(shape).passthrough();
}

export const parameterExtractor = {
    async extract(
        intent: IntentName,
        message: string,
        ctx: UserContext,
        currentDraft: Record<string, any> = {}
    ): Promise<ExtractionResult> {
        const def = INTENT_REGISTRY[intent];
        const allFields = [...def.required, ...def.optional];

        // Build the dream context map so the LLM can resolve "FAANG dream" → id
        const dreamMap = ctx.activeDreams
            .map((d) => `  "${d.title}" → id: "${d.id}"`)
            .join('\n');

        // Build the task/checkpoint context map so the LLM can resolve task names to IDs
        const taskMap = ctx.activeCheckpoints
            .map((c) => `  Task "${c.taskTitle}" → taskId: "${c.taskId}", checkpointId: "${c.checkpointId}"`)
            .join('\n');

        const systemPrompt = `You are a parameter extractor for DreamPlanner.

Extract parameters for intent: ${intent}

REQUIRED fields (must be extracted or null if not mentioned):
${def.required.map((f) => `  - ${f}`).join('\n')}

OPTIONAL fields (extract only if mentioned):
${def.optional.map((f) => `  - ${f}`).join('\n')}

CONTEXT — Use these IDs to resolve natural language names (e.g. "my OS task" -> exact taskId):
Active Dreams:
${dreamMap || '  (none)'}
Active Tasks & Checkpoints:
${taskMap || '  (none)'}

Today's date: ${new Date().toISOString().split('T')[0]}

RULES:
1. Return ONLY a JSON object.
2. If a required field is not mentioned, set it to null.
3. Dates MUST be converted to ISO format (YYYY-MM-DD or full ISO string).
   - "tomorrow" → ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
   - "next week" → ${new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}
4. "dreamId", "taskId", "checkpointId" → look up from the CONTEXT lists above by name match.
5. "priority" → must be an integer 1–5 (1=lowest, 5=highest).
6. "delta" / "value" → must be a number.
7. Prefer existing draft values if the user hasn't changed them:
${JSON.stringify(currentDraft, null, 2)}`;

        try {
            const response = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message },
                ],
                temperature: 0.1,
                max_tokens: 300,
                response_format: { type: 'json_object' },
            });

            const raw = response.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw);

            // Merge with existing draft (draft wins only where the new extraction is null/undefined)
            const merged: Record<string, any> = { ...currentDraft };
            for (const field of allFields) {
                if (parsed[field] !== null && parsed[field] !== undefined) {
                    merged[field] = parsed[field];
                }
            }

            // Validate with loose schema (all fields present, types are flexible)
            const schema = buildLooseSchema(intent);
            schema.parse(merged); // throws ZodError if shape is completely wrong

            // Determine which required fields are still null/missing
            const missingFields = def.required.filter(
                (f) => merged[f] === null || merged[f] === undefined
            );

            return { parameters: merged, missingFields };

        } catch (error: any) {
            await logger.error('ai-extractor', 'Parameter extraction failed', { error: error.message, intent });
            // Return what we have from the draft, report all required fields missing
            const missingFields = def.required.filter(
                (f) => currentDraft[f] === null || currentDraft[f] === undefined
            );
            return { parameters: currentDraft, missingFields };
        }
    },

    // Ask the user for the next single missing field (one at a time for clarity)
    fieldQuestion(intent: IntentName, missingField: string, ctx: UserContext): string {
        const dreamOptions = ctx.activeDreams.map((d) => `"${d.title}"`).join(', ');

        const questions: Record<string, string> = {
            title: `What should the title be?`,
            deadline: `What's the deadline? (e.g. "March 15" or "next Friday")`,
            dreamId: `Which dream does this belong to? Your active dreams: ${dreamOptions || 'none found'}.`,
            priority: `What priority? (1 = low, 5 = critical)`,
            description: `Any description or details? (or say "skip")`,
            startDate: `When should reminders start? (or say "skip")`,
            estimatedDuration: `How long do you estimate this will take in minutes? (or say "skip")`,
            dreamTitle: `What's the dream title?`,
            dreamDescription: `Describe the dream in one or two sentences.`,
            motivationStatement: `What's your "why" — your emotional reason for this dream?`,
            impactScore: `How impactful is this dream to your life? (1–10)`,
            taskId: `Which task? Your active tasks: ${ctx.activeCheckpoints.map(c => `"${c.taskTitle}"`).join(', ') || 'none found'}.`,
            checkpointId: `Which checkpoint?`,
            delta: `How much progress did you make? (1–100)`,
            value: `What's the progress value? (0–100)`,
            weekStart: `Which week? (e.g. "last week" or a date like "2026-03-01")`,
            motivationTone: `What motivation tone do you prefer? Options: HARSH, POSITIVE, OPTIMISTIC, FEAR, LOGICAL, NEUTRAL`,
            notificationFrequency: `How often should I remind you? (in minutes, e.g. 60)`,
            sleepStart: `What time do you usually go to sleep? (HH:MM, e.g. "23:30")`,
            sleepEnd: `What time do you usually wake up? (HH:MM, e.g. "06:30")`,
            timezone: `What's your timezone? (e.g. "Asia/Kolkata")`,
        };

        return questions[missingField] ?? `What's the ${missingField}?`;
    },
};
