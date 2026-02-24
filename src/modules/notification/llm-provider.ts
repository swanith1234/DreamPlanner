// src/modules/notification/llm-provider.ts
import { groq, GROQ_MODEL } from '../../config/ai';
import { logger } from '../../utils/logger';
import { NotificationType, MotivationTone } from '@prisma/client';

export interface MessageGenerationInput {
  notificationType: NotificationType;
  userTone: MotivationTone;

  userIdentity: {
    dreamTitle: string;
    motivationStatement: string;
    deadlineInDays: number;
    tone: string;
  };

  currentSprint?: {
    disciplineScore: number;
    activeDays: string; // e.g., "4/7"
    lateCheckpoints: number;
    overdueTasks: number;
    currentStreak: number;
    effortTrend: string;
    remainingWorkPercent: number;
    behavioralState: string;
  };

  pastSprint?: {
    disciplineScore: number;
    disciplineTrend: string;
    behavioralState: string;
  };

  today?: {
    checkpointTitle: string;
    currentProgress: number;
    target: number;
    isBehindSchedule: boolean;
    hoursLeftToday: number;
  };
}

/**
 * Generate personalized notification messages using Groq LLM
 * Based on highly structured performance analytics
 */
export async function generateNotificationMessageWithLLM(
  input: MessageGenerationInput
): Promise<string> {
  try {
    const { notificationType, userTone, userIdentity, currentSprint, pastSprint, today } = input;

    // Construct the structured JSON payload requested by the prompt
    const contextPayload = {
      UserIdentity: {
        Dream: userIdentity.dreamTitle,
        Why: userIdentity.motivationStatement,
        DeadlineInDays: userIdentity.deadlineInDays,
        Tone: userIdentity.tone,
      },
      CurrentSprint: currentSprint || null,
      PastSprint: pastSprint || null,
      Today: today || null,
    };

    const prompt = `
You are DreamPlanner's performance agent.
You speak according to the user's selected motivation tone.
You DO NOT compute metrics.
You interpret structured performance data and generate a short, powerful notification (max 120 words).
Your objective:
Trigger action.
Reference real performance data.
Avoid generic motivation.
Tie message to user's dream "why."
Mention consequences of inaction when tone requires it.
Mention progress improvement when earned.
Never fabricate metrics.
Use only provided data.

INPUT STRUCTURE (Dynamic):
${JSON.stringify(contextPayload, null, 2)}
`;

    const message = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
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

// The legacy buildContext and getToneInstruction functions are removed, 
// as LLM now consumes the structured JSON payload directly in the prompt generator.

/**
 * Default messages (fallback)
 */
function getDefaultMessage(notificationType: NotificationType): string {
  const defaults: Partial<Record<NotificationType, string>> = {
    REMINDER: 'Time to check in on your task!',
    MOTIVATIONAL: 'Keep going!',
    SYSTEM: 'New notification',
    PROGRESS_CHECK: 'How is your progress today?',
  };

  return defaults[notificationType] || 'Check your DreamPlanner';
}