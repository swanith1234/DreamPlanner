// src/modules/notification/llm-provider.ts
import { logger } from '../../utils/logger';
import { NotificationType, MotivationTone } from '@prisma/client';
import { buildNotificationPrompt } from '../../utils/notificationPromptBuilder';
import { callLLM } from '../../ai/llmClient';

export interface MessageGenerationInput {
  notificationType: string;
  caseType: 'Case1' | 'Case2';
  userTone: MotivationTone;

  userIdentity: {
    dreamTitle: string;
    motivationStatement: string;
    agentName: string;
  };

  statusEvaluation: any; // dynamically filled based on caseType
}

/**
 * Generate personalized notification messages using OpenRouter via callLLM
 */
export async function generateNotificationMessageWithLLM(
  input: MessageGenerationInput
): Promise<{ message: string; extractedTaskTitle?: string }> {
  const { caseType, userIdentity, statusEvaluation, userTone } = input;

  let baseContext = '';
  let userPrompt = '';

  if (caseType === 'Case1') {
     baseContext = `You are ${userIdentity.agentName}, IgniteMate's push notification agent.
Your objective is to trigger immediate execution.

Prompt Instruction:
- Generate a short, punchy notification.
- Remind the user of their current daily checkpoints.
- Acknowledge the time remaining in the day.
- Push them hard to execute and reach the dream.
- Include the user's motivational_context to personalize the tone.
- Length: Strictly 1 to 2 short sentences. No bold. No Markdown.`;

     userPrompt = `Inputs:
- Dream: ${userIdentity.dreamTitle}
- Motivational Context: ${userIdentity.motivationStatement}
- Progress Made Today: ${statusEvaluation.progressMadeToday || 'None'}
- Time Remaining in Day: ${statusEvaluation.timeRemainingInDay} hours
- Today's Checkpoints: ${statusEvaluation.todaysCheckpoints?.join(', ') || 'Your pending tasks'}`;

  } else {
     baseContext = `You are ${userIdentity.agentName}, IgniteMate's push notification agent.
The user has an active dream but their task queue is empty.

Prompt Instruction:
- Analyze the recently completed tasks.
- Look at the pending milestone from their visual roadmap.
- Formulate a push notification suggesting the EXACT next task they should take up.
- Format the notification as an interactive question.

Crucial Formatting MUST FOLLOW:
- Your output MUST end with an actionable confirmation, strictly: "Reply YES to add this to your queue."
- Maximum 2 sentences. No markdown formatting.`;

     userPrompt = `Inputs:
- Dream: ${userIdentity.dreamTitle}
- Completed Tasks: ${statusEvaluation.completedTasks}
- First Pending Milestone: ${statusEvaluation.firstPendingMilestone}`;
  }

  const systemPrompt = buildNotificationPrompt(userTone, baseContext);

  let generatedMessage = '';

  try {
    generatedMessage = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.7, max_tokens: 512 });
  } catch (error: any) {
    logger.warn('notification-llm', 'LLM notification generation failed', { error: error.message });
  }

  if (!generatedMessage) {
    return { message: getDefaultMessage(input.notificationType as any) };
  }

  let extractedTaskTitle: string | undefined = undefined;
  if (caseType === 'Case2') {
     extractedTaskTitle = generatedMessage.replace(/Reply YES.*/i, '').trim();
  }

  return { message: generatedMessage, extractedTaskTitle };
}

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