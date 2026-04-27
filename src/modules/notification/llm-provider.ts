// src/modules/notification/llm-provider.ts
import { logger } from '../../utils/logger';
import { NotificationType, MotivationTone } from '@prisma/client';
import { buildNotificationPrompt } from '../../utils/notificationPromptBuilder';

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

import { 
  groq, GROQ_MODEL, 
  sambanova, SAMBANOVA_MODEL, 
  cerebras, CEREBRAS_MODEL, 
  deepseek, DEEPSEEK_MODEL, 
  openRouter, OPENROUTER_CHEAP_MODEL 
} from '../../config/ai';

const LLM_FALLBACK_CHAIN = [
  { name: 'Groq', client: groq, model: GROQ_MODEL },
  { name: 'DeepSeek', client: deepseek, model: DEEPSEEK_MODEL },
  { name: 'SambaNova', client: sambanova, model: SAMBANOVA_MODEL },
  { name: 'Cerebras', client: cerebras, model: CEREBRAS_MODEL },
  { name: 'OpenRouter', client: openRouter, model: OPENROUTER_CHEAP_MODEL },
];

/**
 * Generate personalized notification messages using a multi-provider fallback chain
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
  let lastError = null;

  // ── FALLBACK CHAIN EXECUTION ─────────────────────────────────────────────
  for (const provider of LLM_FALLBACK_CHAIN) {
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      generatedMessage = response.choices[0]?.message?.content?.trim() || '';
      
      if (generatedMessage) {
        await logger.info('llm', `Message generated successfully via ${provider.name}`, {
          caseType,
          model: provider.model
        });
        break; // Success!
      }
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error.status === 429 || error.message?.toLowerCase().includes('rate limit') || error.message?.toLowerCase().includes('token limit');
      
      await logger.warn('llm', `Provider ${provider.name} failed`, {
        error: error.message,
        isRateLimit,
        nextProvider: LLM_FALLBACK_CHAIN[LLM_FALLBACK_CHAIN.indexOf(provider) + 1]?.name || 'None'
      });

      if (!isRateLimit && error.status !== 500 && error.status !== 503) {
        // If it's a prompt error (400) or auth error (401), we might want to stop, 
        // but for notifications, we try to be resilient and move to the next provider anyway.
      }
    }
  }

  if (!generatedMessage) {
    await logger.error('llm', 'All providers in fallback chain failed', { error: lastError?.message });
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