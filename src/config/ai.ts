import Groq from 'groq-sdk';
import { env } from './env';

const groq = new Groq({
  apiKey: env.groq.apiKey,
});

export { groq };
export const GROQ_MODEL = env.groq.model;