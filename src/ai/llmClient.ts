// src/ai/llmClient.ts
// ─────────────────────────────────────────────────────────────────────────────
// Universal LLM executor with provider fallback + retry.
//
// Provider order:
//   1. OpenCode Zen (space-bunny-free) — $0 tokens, zero-retention, reasoning
//   2. Groq         — fast, tighter rate limits
//   3. Cerebras     — free daily quota
//   4. SambaNova    — free tier
//   5. OpenRouter   — legacy space-bunny-alpha slug
//
// Why the careful bits below:
//   • `reasoning_content` is a separate field. A reasoning model spends part of
//     its output budget thinking; if `content` is empty but reasoning is
//     non-empty, the response was truncated and we retry with a bigger budget.
//   • `max_tokens` is a HARD cap shared by reasoning + visible output. The old
//     150/300-token caps caused silent empty replies.
//   • Retries are per-provider and only on transient errors, so a 400 from a
//     bad schema doesn't burn the whole queue.
// ─────────────────────────────────────────────────────────────────────────────

import { zen, openRouter, groq, cerebras, sambanova, ZEN_MODEL, GROQ_MODEL, CEREBRAS_MODEL, SAMBANOVA_MODEL, OPENROUTER_PRIMARY_MODEL } from '../config/ai';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    /** Non-standard field some reasoning models return. Never sent upstream. */
    reasoning_content?: string | null;
};

export interface LLMOptions {
    complexity: 'SIMPLE' | 'COMPLEX';
    tools?: any[];
    jsonMode?: boolean;
    temperature?: number;
    max_tokens?: number;
}

interface ProviderEntry {
    client: any;
    model: string;
    label: string;
    /** Providers that reliably support native tool-calling. */
    supportsTools: boolean;
    supportsJsonMode: boolean;
}

function buildProviderQueue(): ProviderEntry[] {
    const q: ProviderEntry[] = [];

    if (zen) {
        q.push({ client: zen, model: ZEN_MODEL, label: 'Zen', supportsTools: true, supportsJsonMode: true });
    }
    if (groq) {
        q.push({ client: groq, model: GROQ_MODEL, label: 'Groq', supportsTools: true, supportsJsonMode: true });
    }
    if (cerebras) {
        q.push({ client: cerebras, model: CEREBRAS_MODEL, label: 'Cerebras', supportsTools: true, supportsJsonMode: true });
    }
    if (sambanova) {
        q.push({ client: sambanova, model: SAMBANOVA_MODEL, label: 'Sambanova', supportsTools: true, supportsJsonMode: false });
    }
    if (openRouter) {
        q.push({ client: openRouter, model: OPENROUTER_PRIMARY_MODEL, label: 'OpenRouter', supportsTools: true, supportsJsonMode: true });
    }
    return q;
}

/** Statuses worth retrying on the same provider before moving on. */
function isTransient(status: number | undefined): boolean {
    if (!status) return true;               // network/timeout — no status at all
    return status === 408 || status === 409 || status === 429 || status >= 500;
}

function extractStatus(error: any): number | undefined {
    return error?.status ?? error?.response?.status;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * True when a reasoning model burned its whole output budget thinking and never
 * emitted visible text. Retrying with a larger cap is the only fix.
 */
function isReasoningTruncated(message: any): boolean {
    if (!message) return false;
    const hasText = typeof message.content === 'string' && message.content.trim().length > 0;
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
    const hasReasoning = typeof message.reasoning_content === 'string' && message.reasoning_content.trim().length > 0;
    return !hasText && !hasToolCalls && hasReasoning;
}

/** `reasoning_content` is a response-only field; some APIs reject it on input. */
function stripInternalFields(messages: ChatMessage[]): any[] {
    return messages.map((m) => {
        const { reasoning_content, ...rest } = m as any;
        return rest;
    });
}

/**
 * Execute a chat completion against the provider queue with retries.
 *
 * `iteration` only affects log lines. Returns the raw OpenAI-compatible
 * response so callers can inspect `tool_calls`.
 */
export async function executeWithFallback(
    messages: ChatMessage[],
    options: LLMOptions,
    iteration: number = 0
): Promise<any> {
    const { complexity, tools, jsonMode, temperature } = options;

    let maxTokens = options.max_tokens ?? (complexity === 'COMPLEX' ? 2048 : 1024);
    const providers = buildProviderQueue();

    if (providers.length === 0) {
        throw new Error('No LLM providers configured. Set OPENCODE_API_KEY in backend/.env.');
    }

    let lastError: any = null;

    for (const provider of providers) {
        // A tool-calling turn must not land on a provider that can't do tools.
        const activeTools = tools && tools.length > 0 ? (provider.supportsTools ? tools : undefined) : undefined;
        const useJsonMode = jsonMode && provider.supportsJsonMode;

        for (let attempt = 0; attempt <= env.ai.maxRetries; attempt++) {
            try {
                const start = Date.now();
                const payload: any = {
                    model: provider.model,
                    messages: stripInternalFields(messages),
                    temperature: temperature ?? (complexity === 'COMPLEX' ? 0.7 : 0.4),
                    max_tokens: maxTokens,
                };

                if (activeTools && activeTools.length > 0) {
                    payload.tools = activeTools;
                    payload.tool_choice = 'auto';
                }

                if (useJsonMode) {
                    payload.response_format = { type: 'json_object' };
                }

                const response: any = await provider.client.chat.completions.create(payload);

                if (!response || !Array.isArray(response.choices) || response.choices.length === 0 || !response.choices[0]?.message) {
                    const errDetail = response?.error?.message || 'Invalid or missing choices array in response';
                    throw new Error(`Provider ${provider.label} returned malformed response: ${errDetail}`);
                }

                const message = response.choices[0].message;

                // Reasoning model spent its budget thinking and produced nothing.
                // Escalate the cap and retry rather than surfacing an empty bubble.
                if (isReasoningTruncated(message)) {
                    lastError = new Error(`${provider.label} truncated its reasoning before producing output`);
                    if (attempt < env.ai.maxRetries && maxTokens < 8192) {
                        maxTokens = Math.min(8192, maxTokens * 2);
                        await logger.warn('llm-client',
                            `[LLM] reasoning truncated, retrying with max_tokens=${maxTokens} provider=${provider.label}`, {});
                        continue;
                    }
                    throw lastError;
                }

                const ms = Date.now() - start;
                const usage = response.usage;
                const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;

                await logger.info('llm-client',
                    `[LLM] ok=true provider=${provider.label} iter=${iteration} model=${provider.model} ms=${ms} ` +
                    `t=${usage?.total_tokens ?? 0} reasoning=${reasoningTokens} toolCalls=${message.tool_calls?.length ?? 0}`, {});

                return response;

            } catch (error: any) {
                lastError = error;
                const status = extractStatus(error);
                const transient = isTransient(status);

                await logger.warn('llm-client',
                    `[LLM] ok=false provider=${provider.label} iter=${iteration} attempt=${attempt + 1} ` +
                    `status=${status ?? 'N/A'}: ${error?.message}. ${transient && attempt < env.ai.maxRetries ? 'Retrying...' : 'Falling back...'}`, {});

                if (!transient || attempt >= env.ai.maxRetries) break;

                // Exponential backoff, respects Retry-After when the API sends it.
                const retryAfter = parseInt(error?.response?.headers?.['retry-after'] ?? '', 10);
                const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(4000, 500 * Math.pow(2, attempt));
                await sleep(delayMs);
            }
        }
    }

    throw new Error(`All LLM fallback providers exhausted. Last error: ${lastError?.message || 'Unknown'}`);
}

/**
 * Single text completion. Returns '' rather than throwing when the provider
 * gives back nothing, so cosmetic passes (polish, naturalize) degrade quietly
 * instead of failing the turn.
 */
export async function callLLM(
    messages: ChatMessage[],
    options: {
        max_tokens?: number;
        temperature?: number;
        jsonMode?: boolean;
    } = {}
): Promise<string> {
    try {
        const response = await executeWithFallback(messages, {
            complexity: 'SIMPLE',
            jsonMode: options.jsonMode,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
        });
        return response.choices[0].message.content?.trim() || '';
    } catch {
        return '';
    }
}
