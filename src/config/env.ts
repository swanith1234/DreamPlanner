import dotenv from 'dotenv';

dotenv.config();

export const env = {
  database: {
    url: process.env.DATABASE_URL!,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY!,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
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
const requiredVars = ['DATABASE_URL', 'GROQ_API_KEY', 'JWT_SECRET'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}
