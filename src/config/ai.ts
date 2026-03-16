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

// Tertiary Provider: Fast fallback for open-source models
export const togetherAi = new OpenAI({
  apiKey: env.ai.togetherApiKey,
  baseURL: 'https://api.together.xyz/v1',
});

// Export default model names
export const GROQ_MODEL = env.ai.groqModel;
export const OPENROUTER_CHEAP_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
export const OPENROUTER_COMPLEX_MODEL = 'anthropic/claude-3.5-haiku'; // Standard model ID
export const TOGETHER_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';