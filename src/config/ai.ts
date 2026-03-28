import OpenAI from 'openai';
import { env } from './env';

// Primary Provider: Fast, but aggressive rate limits
export const groq = new OpenAI({
  apiKey: env.ai.groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Secondary Provider: Highly reliable, supports heavy reasoning models natively
export const openRouter = new OpenAI({
  apiKey: env.ai.openRouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://dreamplanner.dev', // Required by OpenRouter for some models
    'X-Title': 'DreamPlanner AI',
  }
});


// New Fast Providers
export const deepseek = new OpenAI({
  apiKey: env.ai.deepseekApiKey,
  baseURL: 'https://api.deepseek.com',
});

export const cerebras = new OpenAI({
  apiKey: env.ai.cerebrasApiKey,
  baseURL: 'https://api.cerebras.ai/v1',
});

export const sambanova = new OpenAI({
  apiKey: env.ai.sambanovaApiKey,
  baseURL: 'https://api.sambanova.ai/v1',
});

// Export default model names
export const GROQ_MODEL = env.ai.groqModel;
export const OPENROUTER_CHEAP_MODEL = 'openai/gpt-4o-mini';
export const OPENROUTER_COMPLEX_MODEL = 'openai/gpt-4o-2024-08-06';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const CEREBRAS_MODEL = 'llama-3.3-70b';
export const SAMBANOVA_MODEL = 'Meta-Llama-3.3-70B-Instruct';