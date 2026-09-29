import dotenv from 'dotenv';

dotenv.config();

export const env = {
  database: {
    url: process.env.DATABASE_URL!,
  },
  ai: {
    // ── OpenCode Zen (primary) ──────────────────────────────────────────────
    // `space-bunny-free` is $0 for input/output/cached tokens, OpenAI-compatible,
    // and zero-retention. Optional: if unset the server still boots and the
    // provider queue falls through to the next configured entry.
    opencodeApiKey: process.env.OPENCODE_API_KEY || '',
    opencodeBaseUrl: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1',
    opencodeModel: process.env.OPENCODE_MODEL || 'space-bunny-free',

    groqApiKey: process.env.GROQ_API_KEY!,
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openAiApiKey: process.env.OPENAI_API_KEY || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    cerebrasApiKey: process.env.CEREBRAS_API_KEY || '',
    sambanovaApiKey: process.env.SAMBANOVA_API_KEY || '',

    // Per-request timeout (ms) for LLM calls. Reasoning models like
    // space-bunny-free take 2-6s on a warm prompt, but cold prompts have been
    // observed at 40s+. Kept at 30s so a single stalled call can't eat the
    // whole turn budget in agentLoop.
    requestTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),
    // Max retries per provider before falling through to the next one.
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '2', 10),
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'ethereal', // 'ethereal' | 'smtp'
    from: process.env.EMAIL_FROM || 'swanithpidugu@gmail.com',
    // SMTP Config (for production)
    brevoApiKey: process.env.BREVO_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    },
  }
};

// Validate required env vars
const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

// At least one LLM provider must be configured, or every chat turn 500s.
const hasAnyProvider = Boolean(
  env.ai.opencodeApiKey ||
  env.ai.openRouterApiKey ||
  env.ai.groqApiKey ||
  env.ai.cerebrasApiKey ||
  env.ai.sambanovaApiKey,
);
if (!hasAnyProvider) {
  throw new Error(
    'No LLM provider configured. Set OPENCODE_API_KEY (recommended — space-bunny-free is free).',
  );
}
