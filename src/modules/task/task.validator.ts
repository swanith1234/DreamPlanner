
// src/modules/task/task.validator.ts
import { groq, GROQ_MODEL } from '../../config/ai';
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

      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

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