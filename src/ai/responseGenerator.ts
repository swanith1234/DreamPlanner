// src/ai/responseGenerator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Converts raw API results / orchestrator states into a structured ChatResponse.
// All AI replies now include: text, optional editableContent, and responseMode.
// ─────────────────────────────────────────────────────────────────────────────

import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { UserContext } from './contextBuilder';

export type ResponseMode =
    | 'SUCCESS'           // API call succeeded
    | 'ERROR'             // API call returned 4xx/5xx
    | 'MISSING_FIELDS'    // asking user for more info
    | 'CONFIRMATION'      // presenting summary before execution
    | 'CHECKPOINT_REVIEW' // presenting AI-suggested checkpoint list
    | 'CHAT';             // pure conversation reply

// ── Public contract returned to the chat route ────────────────────────────────
export interface ChatResponse {
    text: string;
    editableContent?: string; // Pre-fills the textarea (e.g. checkpoint list to edit)
    responseMode: ResponseMode;
}

export interface GenerateResponseInput {
    responseMode: ResponseMode;
    intent?: string;
    apiResult?: any;
    apiError?: string;
    confirmationSummary?: string;
    checkpointList?: any[];
    missingFieldQuestion?: string;
    userMessage: string;
    ctx: UserContext;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
    HARSH: 'Be direct, blunt, no fluff. Hold the user accountable. Short sentences.',
    POSITIVE: 'Be warm, encouraging, and celebratory. Use emojis sparingly.',
    OPTIMISTIC: 'Be upbeat and forward-looking. Focus on possibilities.',
    FEAR: 'Be serious. Remind the user of the cost of inaction firmly.',
    LOGICAL: 'Be precise and data-driven. Use numbers from the context.',
    NEUTRAL: 'Be professional and concise. No extra flair.',
};

export const responseGenerator = {

    async generate(input: GenerateResponseInput): Promise<ChatResponse> {
        const toneStyle = TONE_INSTRUCTIONS[input.ctx.motivationTone] || TONE_INSTRUCTIONS.NEUTRAL;

        // ── MISSING_FIELDS — no LLM needed ───────────────────────────────────────
        if (input.responseMode === 'MISSING_FIELDS' && input.missingFieldQuestion) {
            return { text: input.missingFieldQuestion, responseMode: 'MISSING_FIELDS' };
        }

        // ── CONFIRMATION — show summary + yes gate ────────────────────────────────
        if (input.responseMode === 'CONFIRMATION' && input.confirmationSummary) {
            return {
                text: `${input.confirmationSummary}\n\nShall I go ahead? Reply **yes** to confirm or tell me what to change.`,
                responseMode: 'CONFIRMATION',
            };
        }

        // ── CHECKPOINT_REVIEW — inject editable list into the input bar ───────────
        if (input.responseMode === 'CHECKPOINT_REVIEW' && input.checkpointList) {
            const mdList = input.checkpointList
                .map((cp, i) => `${i + 1}. **${cp.title}** — ${cp.targetDate}`)
                .join('\n');
            const editableContent = input.checkpointList
                .map((cp, i) => `${i + 1}. ${cp.title} — ${cp.targetDate}`)
                .join('\n');
            return {
                text: `Here are the suggested checkpoints:\n\n${mdList}\n\nI've loaded them into your input bar so you can edit them directly. Say **"looks good"** to confirm, or modify any line.`,
                editableContent,
                responseMode: 'CHECKPOINT_REVIEW',
            };
        }

        // ── ERROR — keep draft alive, surface the issue ───────────────────────────
        if (input.responseMode === 'ERROR') {
            const prompt = `You are IgniteMate, a DreamPlanner AI assistant.
The user tried to perform an action but it failed with this error:
"${input.apiError}"

Tell the user what went wrong in plain language. Be concise. Do NOT say the action succeeded.
Suggest what they can fix. Tone: ${toneStyle}`;

            const text = await responseGenerator._callGroq(prompt);
            return { text, responseMode: 'ERROR' };
        }

        // ── SUCCESS — celebrate with context-aware message ────────────────────────
        if (input.responseMode === 'SUCCESS') {
            const prompt = `You are IgniteMate, a DreamPlanner AI assistant.
The user's request was completed successfully.
Intent: ${input.intent}
API result summary: ${JSON.stringify(input.apiResult).slice(0, 400)}
User context: discipline score ${input.ctx.currentWeek?.disciplineScore ?? 'N/A'}/100, tone: ${input.ctx.motivationTone}

Write a short, friendly confirmation (2–3 sentences max).
Tone style: ${toneStyle}
Do not repeat all the raw data. Summarize meaningfully.`;

            const text = await responseGenerator._callGroq(prompt);
            return { text, responseMode: 'SUCCESS' };
        }

        // ── CHAT — general conversation ───────────────────────────────────────────
        const chatPrompt = `You are IgniteMate, the DreamPlanner AI assistant.
User: ${input.ctx.userName}
Discipline score this week: ${input.ctx.currentWeek?.disciplineScore ?? 'N/A'}/100
Active dreams: ${input.ctx.activeDreams.map((d) => d.title).join(', ') || 'none'}
Active checkpoints: ${input.ctx.activeCheckpoints.map((c) => c.checkpointTitle).join(', ') || 'none'}

Tone style: ${toneStyle}

Respond to the user's message in 2–4 sentences. Stay focused on their goals and progress.
User message: "${input.userMessage}"`;

        const text = await responseGenerator._callGroq(chatPrompt);
        return { text, responseMode: 'CHAT' };
    },

    // ── Internal Groq call with fallback ─────────────────────────────────────

    async _callGroq(prompt: string): Promise<string> {
        try {
            const response = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 200,
            });
            return response.choices[0]?.message?.content?.trim() || "I'm here — what would you like to do?";
        } catch (error: any) {
            await logger.error('ai-response', 'Response generation failed', { error: error.message });
            return "I'm here to help. Could you repeat what you'd like to do?";
        }
    },
};
