
import { groq, GROQ_MODEL } from '../../config/ai';
import { DreamValidationResponse } from '../../types';
import { logger } from '../../utils/logger';

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
  "isValid": boolean,
  "warnings": ["warning1", "warning2"],
  "checkpoints": [
    {
      "title": "Checkpoint 1",
      "description": "description",
      "expectedEffort": 5,
      "miniDeadline": "2026-02-12"
    }
  ]
}

Rules for validation:
- isValid = true if the dream is meaningful, specific, and has realistic timeline
- isValid = false if it's vague, too ambitious, or deadline is unrealistic (e.g., < 7 days for major goal)
- Generate 4-5 concrete checkpoints that break down the dream
- Warnings should highlight concerns (e.g., "Timeline is tight", "Goal needs more specificity")`;

      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      return {
        isValid: parsed.isValid || false,
        warnings: parsed.warnings || [],
        suggestedCheckpoints: parsed.checkpoints || [],
      };
    } catch (error: any) {
      await logger.error('ai', 'Dream validation failed', {
        error: error.message,
      });
      // Return conservative validation on error
      return {
        isValid: false,
        warnings: ['AI validation unavailable, please try again'],
        suggestedCheckpoints: [],
      };
    }
  }
}

export const dreamValidator = new DreamValidator();