// src/ai/llmClient.ts
import { groq, cerebras, sambanova, GROQ_MODEL, CEREBRAS_MODEL, SAMBANOVA_MODEL } from '../config/ai';
import { logger } from '../utils/logger';

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
};

export interface LLMOptions {
    complexity: 'SIMPLE' | 'COMPLEX';
    tools?: any[];
    jsonMode?: boolean;
    temperature?: number;
    max_tokens?: number;
}

/**
 * Universal LLM Executor with Priority Fallback Queue.
 * Uses FREE-TIER providers only: SambaNova -> Cerebras -> Groq.
 */
export async function executeWithFallback(
    messages: ChatMessage[],
    options: LLMOptions,
    iteration: number = 0
) {
    const { complexity, tools, jsonMode, temperature, max_tokens } = options;

    // All free-tier providers with generous limits
    // SambaNova: Free $5 credit, fast inference on custom hardware
    // Cerebras: 1M tokens/day free, extremely fast inference
    // Groq: 100k tokens/day free, fast LPU inference
    const providers = [
        { client: sambanova, model: SAMBANOVA_MODEL, label: 'Sambanova' },
        { client: cerebras, model: CEREBRAS_MODEL, label: 'Cerebras' },
        { client: groq, model: 'llama-3.3-70b-versatile', label: 'Groq' },
    ];

    let lastError: any = null;

    for (const provider of providers) {
        try {
            const start = Date.now();
            const payload: any = {
                model: provider.model,
                messages: messages as any[],
                temperature: temperature ?? (complexity === 'COMPLEX' ? 0.7 : 0.4),
                max_tokens: max_tokens ?? (complexity === 'COMPLEX' ? 1500 : 768),
            };

            if (tools && tools.length > 0) {
                payload.tools = tools;
                payload.tool_choice = 'auto';
            }

            if (jsonMode) {
                payload.response_format = { type: 'json_object' };
            }

            const response = await provider.client.chat.completions.create(payload);
            
            const ms = Date.now() - start;
            const usage = response.usage;
            
            await logger.info('llm-client', 
                `[LLM] ok=true provider=${provider.label} iter=${iteration} model=${provider.model} ms=${ms} t=${usage?.total_tokens}`, 
                {}
            );

            return response;
        } catch (error: any) {
            lastError = error;
            const status = error.status || error.response?.status || 500;
            
            // 402 = Payment Required (OpenRouter)
            // 429 = Rate Limit
            // 5xx = Server Error
            await logger.warn('llm-client', `[LLM] ok=false provider=${provider.label} iter=${iteration} error=${status}. Falling back...`, { message: error.message });
            
            // Each provider has a DIFFERENT API key. If one fails with 401/403, 
            // we absolutely MUST fallback to the next provider.
            // Groq uses 400 for context limit, OpenRouter uses 404/400 for bad models.
            // We catch ALL errors here and allow the loop to proceed to the next provider.
        }
    }

    throw new Error(`All LLM fallback providers exhausted. Last Error: ${lastError?.message || 'Unknown'}`);
}
