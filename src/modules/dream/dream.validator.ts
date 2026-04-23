import { groq, GROQ_MODEL } from '../../config/ai';
import { DreamValidationResponse } from '../../types';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import { ServiceUnavailableError } from '../../utils/errors';

const DreamValidationZodSchema = z.object({
  isValid: z.boolean(),
  warnings: z.array(z.string()),
  checkpoints: z.array(z.object({
    title: z.string(),
    description: z.string(),
    expectedEffort: z.number(),
    miniDeadline: z.string()
  })).optional().default([]),
});

export class DreamValidator {
  async validateDreamContent(
    title: string,
    description: string,
    deadline: Date,
    motivationStatement: string | undefined
  ): Promise<DreamValidationResponse> {
    try {
      const daysUntilDeadline = Math.floor(
        (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const prompt = `You are a dream validation assistant. Analyze this dream:

Title: ${title}
Description: ${description}
Days until deadline: ${daysUntilDeadline}
Motivation: ${motivationStatement || 'Not provided'}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  // Set false ONLY if the goal is explicitly harmful, violent, irrelevant trolling, or a literal physical impossibility (e.g., "become Elon Musk", "build a time machine", "go to Mars tomorrow").
  // MUST Set true for almost all genuine human goals, even highly ambitious ones with extremely short deadlines (e.g., "Get a Google job in 1 week"). Assume the user is already highly skilled and just needs a roadmap. Do not reject based on short timelines.
  "isValid": boolean,
  
  // Warnings should constructively highlight concerns WITHOUT aggressively rejecting the dream.
  "warnings": ["warning1", "warning2"],
  
  // Generate 4-5 concrete checkpoints that break down the dream.
  "checkpoints": [
    {
      "title": "Checkpoint 1",
      "description": "description",
      "expectedEffort": 5,
      "miniDeadline": "2026-02-12"
    }
  ]
}`;

      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const validated = DreamValidationZodSchema.parse(parsed);

      return {
        isValid: validated.isValid,
        warnings: validated.warnings,
        suggestedCheckpoints: validated.checkpoints.map(cp => ({
          ...cp,
          miniDeadline: cp.miniDeadline ? new Date(cp.miniDeadline) : undefined,
        })),
      };
    } catch (error: any) {
      await logger.error('ai', 'Dream validation failed', {
        error: error.message,
      });
      // Throw explicitly so the backend returns an HTTP error, rather than silently failing to a false response
      throw new ServiceUnavailableError('AI Dream validation cluster is currently unavailable or returned invalid schema. Please try again.');
    }
  }
}

export const dreamValidator = new DreamValidator();