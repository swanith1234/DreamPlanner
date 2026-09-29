// src/modules/task/task.validator.ts
import { callLLM } from '../../ai/llmClient';
import { safeJsonParse } from '../../ai/jsonParse';
import { logger } from '../../utils/logger';

export class TaskValidator {
  async validateTaskRelevance(
    dreamTitle: string,
    dreamDescription: string,
    taskTitle: string,
    taskDescription: string
  ): Promise<{ isValid: boolean; feedback: string }> {
    try {
      const prompt = `Evaluate task relevance to dream:

Dream: ${dreamTitle}
Dream Description: ${dreamDescription}

Task: ${taskTitle}
Task Description: ${taskDescription || 'No description'}

Is this task clearly aligned with the dream? Respond ONLY with JSON:
{
  "isValid": boolean,
  "feedback": "explanation"
}`;

      const content = await callLLM([{ role: 'user', content: prompt }], {
        temperature: 0.5,
        max_tokens: 200,
      });

      const parsed = safeJsonParse<any>(content, {});

      return {
        isValid: parsed.isValid !== false,
        feedback: parsed.feedback || '',
      };
    } catch (error: any) {
      await logger.error('ai', 'Task validation failed', {
        error: error.message,
      });
      return {
        isValid: true, // Allow task if AI fails
        feedback: '',
      };
    }
  }
}

export const taskValidator = new TaskValidator();