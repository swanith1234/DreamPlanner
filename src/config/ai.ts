import OpenAI from 'openai';
import { env } from './env';

// ─────────────────────────────────────────────────────────────────────────────
// Primary Provider: OpenCode Zen
// `space-bunny-free` — $0 input / $0 output / $0 cached, OpenAI-compatible,
// zero-retention, and a reasoning model (returns `reasoning_content`).
// Docs: https://opencode.ai/docs/zen
// ─────────────────────────────────────────────────────────────────────────────
export const zen = env.ai.opencodeApiKey
  ? new OpenAI({
      apiKey: env.ai.opencodeApiKey,
      baseURL: env.ai.opencodeBaseUrl,
      timeout: env.ai.requestTimeoutMs,
      maxRetries: 0, // retries are handled in llmClient so we can fall through providers
    })
  : null;

// Secondary Provider: OpenRouter
export const openRouter = new OpenAI({
  apiKey: env.ai.openRouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: env.ai.requestTimeoutMs,
  maxRetries: 0,
  defaultHeaders: {
    'HTTP-Referer': 'https://dreamplanner.dev', // Required by OpenRouter for some models
    'X-Title': 'DreamPlanner AI',
  }
});

// Fast Providers — used as fallbacks when Zen rate-limits or times out.
export const groq = new OpenAI({
  apiKey: env.ai.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: env.ai.requestTimeoutMs,
  maxRetries: 0,
});

export const cerebras = new OpenAI({
  apiKey: env.ai.cerebrasApiKey,
  baseURL: 'https://api.cerebras.ai/v1',
  timeout: env.ai.requestTimeoutMs,
  maxRetries: 0,
});

export const sambanova = new OpenAI({
  apiKey: env.ai.sambanovaApiKey,
  baseURL: 'https://api.sambanova.ai/v1',
  timeout: env.ai.requestTimeoutMs,
  maxRetries: 0,
});

export const deepseek = new OpenAI({
  apiKey: env.ai.deepseekApiKey,
  baseURL: 'https://api.deepseek.com',
  timeout: env.ai.requestTimeoutMs,
  maxRetries: 0,
});

// ── Model names ─────────────────────────────────────────────────────────────
export const ZEN_MODEL = env.ai.opencodeModel;               // space-bunny-free
export const GROQ_MODEL = env.ai.groqModel;
export const OPENROUTER_PRIMARY_MODEL = 'stealth/space-bunny-alpha';  // legacy slug, fallback only
export const OPENROUTER_CHEAP_MODEL = 'openai/gpt-4o-mini';
export const OPENROUTER_COMPLEX_MODEL = 'openai/gpt-4o-2024-08-06';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const CEREBRAS_MODEL = 'llama-3.3-70b';
export const SAMBANOVA_MODEL = 'Meta-Llama-3.3-70B-Instruct';