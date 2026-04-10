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
    agentName: string;
  };

  statusEvaluation: {
    caseType: string;
    caseContext: string;
    statusFlag: string;
    disciplineScore: number;
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
    const { notificationType, userTone, userIdentity, statusEvaluation } = input;

    // Construct the structured JSON payload requested by the prompt
    const contextPayload = {
      UserIdentity: {
        Dream: userIdentity.dreamTitle,
        Why: userIdentity.motivationStatement,
        DeadlineInDays: userIdentity.deadlineInDays,
      },
      StatusEvaluation: statusEvaluation,
    };

    const systemPrompt = `You are ${userIdentity.agentName}, IgniteMate's push notification agent.
Your objective is to trigger action immediately based on the StatusEvaluation JSON payload.

CONDITIONAL LOGIC:
- If statusFlag is 'LAGGING': Act as a drill sergeant. You MUST explicitly mention the user's "Why" statement from UserIdentity to wake them up. Include a performance metric (e.g. disciplineScore).
- If statusFlag is 'ON_TRACK': Act as a brief cheerleader. Keep it extremely positive and action-oriented. Do NOT mention the "Why" statement or heavy metrics.

STRICT CONSTRAINTS:
- The message MUST evaluate the 'caseContext'. Case A = active tasks padding progress; Case B = nudge to start pending tasks; Case C = strategic advice on next roadmap step.
- MAXIMUM length 1 to 2 very short, punchy sentences.
- NO preamble (e.g., "Based on the data...").
- NO bolding, Markdown, or headers.`;

    const userPrompt = `DATA:
${JSON.stringify(contextPayload, null, 2)}`;

    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    const generatedMessage = response.choices[0]?.message?.content?.trim() || '';

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

  return defaults[notificationType] || 'Check IgniteMate';
}