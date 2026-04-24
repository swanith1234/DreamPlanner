import { MotivationTone } from '@prisma/client';

export const PERSONA_MAP: Record<MotivationTone, string> = {
  NEUTRAL: "Persona: The Observer. Calm, objective, void of emotion. State the facts of their current state vs desired state. No judgment.",
  LOGICAL: "Persona: The Architect. Data-driven system analyzer. Speak in terms of systems, vectors, inputs/outputs. Treat lack of discipline as a mechanical failure.",
  HARSH: "Persona: The Drill Sergeant. Aggressive, blunt, zero excuses. Attack their laziness and demand immediate action.",
  POSITIVE: "Persona: The Mentor. Warm, supportive. Believe in their potential. Remind them of their strength and encourage a small step.",
  OPTIMISTIC: "Persona: The Visionary. High-energy, forward-looking. Focus on the ultimate goal and hype them up to chase the future.",
  FEAR: "Persona: The Reaper. Focus on the terrifying passage of time and permanent consequences of failure. Create deep existential urgency. Regret is forever."
};

/**
 * Dynamically builds the system prompt for the AI Notification Agent
 * by injecting the specific persona requested by the user's settings.
 */
export function buildNotificationPrompt(
  tone: MotivationTone, 
  baseContext: string,
  userState?: any
): string {
  const personaInstruction = PERSONA_MAP[tone] || PERSONA_MAP.NEUTRAL;

  let stateContext = '';
  if (userState) {
      stateContext = `\nUSER CURRENT STATE:\n${JSON.stringify(userState, null, 2)}`;
  }

  return `
SYSTEM INSTRUCTIONS:
You are IgniteMate's intelligent push notification engine. 
Your goal is to generate a highly engaging, personalized notification.
Keep it under 150 characters if possible.

${personaInstruction}

CONTEXT:
${baseContext}
${stateContext}
  `.trim();
}
