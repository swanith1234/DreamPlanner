// src/modules/notification/llm-provider.ts
import { groq, GROQ_MODEL } from '../../config/ai';
import { logger } from '../../utils/logger';
import { NotificationType, MotivationTone } from '@prisma/client';

export interface MessageGenerationInput {
  notificationType: NotificationType;
  userTone: MotivationTone;
  task?: any;
  dream?: any;
  checkpoint?: any; // Today's checkpoint
  progress?: {
    current: number; // %
    lastUpdated?: Date;
    expected?: number; // Calculated expected progress
  };
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
}

/**
 * Generate personalized notification messages using Groq LLM
 * Based on notification type and user preferences
 */
export async function generateNotificationMessageWithLLM(
  input: MessageGenerationInput
): Promise<string> {
  try {
    const { notificationType, userTone, task, dream, checkpoint, progress, timeOfDay } = input;

    // Build context for LLM
    const context = buildContext(input);
    const toneInstruction = getToneInstruction(userTone);

    const prompt = `
You are a friendly, non-judgmental accountability partner (DreamPlanner).
Your goal is to send a gentle check-in message to the user.

CONTEXT:
${context}

TONE:
${toneInstruction}
- IMPORTANT: Be friendly, human, and low-pressure.
- Do NOT judge or sound disappointed if progress is low.
- If morning: encouragement to start.
- If afternoon/evening: gentle check-in or celebration of progress.
- Max 1 sentence. Keep it chatty.

OUTPUT:
Generate ONLY the message text. No quotes.
`;

    const message = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 60,
    });

    const generatedMessage = message.choices[0]?.message?.content?.trim() || '';

    if (!generatedMessage) {
      return getDefaultMessage(notificationType);
    }

    await logger.info('llm', 'Message generated', {
      notificationType,
      userTone,
      messageLength: generatedMessage.length,
    });

    return generatedMessage;
  } catch (error: any) {
    await logger.error('llm', 'Failed to generate message', {
      error: error.message,
      notificationType: input.notificationType,
    });
    return getDefaultMessage(input.notificationType);
  }
}

/**
 * Build rich context for LLM
 */
function buildContext(input: MessageGenerationInput): string {
  const { notificationType, task, dream, checkpoint, progress, timeOfDay } = input;
  let context = `Time of Day: ${timeOfDay || 'Day'}\n`;

  if (notificationType === 'REMINDER' && task) {
    context += `Task: "${task.title}"\n`;
    if (checkpoint) {
      context += `Focus for today: "${checkpoint.title}"\n`;
    }
    if (progress) {
      context += `Current Progress: ${progress.current}%\n`;
      if (progress.lastUpdated) {
        context += `Last Updated: ${progress.lastUpdated.toISOString()}\n`;
      } else {
        context += `Last Updated: Never\n`;
      }
      if (progress.expected) {
        context += `(System calculated expected progress: ~${progress.expected}%)\n`;
      }
    }
  }

  if (dream) {
    context += `Dream: "${dream.title}"\n`;
    if (dream.motivationStatement) {
      context += `Motivation: "${dream.motivationStatement}"\n`;
    }
  }

  return context;
}

/**
 * Get tone instruction for LLM
 */
function getToneInstruction(tone: MotivationTone): string {
  const instructions: Record<MotivationTone, string> = {
    HARSH:
      'Direct and no-nonsense. But since this is Phase-1, keep it motivating, not mean.',
    POSITIVE:
      'Uplifting, supportive, celebrate small wins. Use emojis.',
    OPTIMISTIC:
      'Enthusiastic, focus on potential. "You got this!" vibe.',
    FEAR:
      'Urgent but friendly. Remind of the deadline gentle.',
    LOGICAL:
      'Factual and efficient. Focus on the plan and next steps.',
    NEUTRAL:
      'Calm, professional, and balanced.',
  };

  return `User Preference: ${instructions[tone] || instructions.NEUTRAL}`;
}

/**
 * Default messages (fallback)
 */
function getDefaultMessage(notificationType: NotificationType): string {
  const defaults: Record<NotificationType, string> = {
    REMINDER: 'Time to check in on your task!',
    MOTIVATIONAL: 'Keep going!',
    SYSTEM: 'New notification',
  };

  return defaults[notificationType] || 'Check your DreamPlanner';
}