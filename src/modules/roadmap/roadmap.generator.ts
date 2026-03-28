import { RoadmapNodeStatus } from '@prisma/client';
import { executeWithFallback } from '../../ai/llmClient';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import type { RoadmapDraftPayload } from './roadmap.dto';
import { SAMBANOVA_MODEL } from '../../config/ai';
import { z } from 'zod';
import { ServiceUnavailableError } from '../../utils/errors';

const RoadmapMilestoneZodSchema = z.object({
  title: z.string(),
  category: z.string(),
  targetUserState: z.string(),
  difficultyLevel: z.number().int().min(1).max(5),
});

const RoadmapGenerationZodSchema = z.object({
  milestones: z.array(RoadmapMilestoneZodSchema)
});

/**
 * Generate a lean, highly technical roadmap JSON draft for a dream.
 */
export async function generateRoadmapDraft(params: {
  userId: string;
  dreamId: string;
  promptVersion: string;
}): Promise<RoadmapDraftPayload> {
  const { userId, dreamId, promptVersion } = params;

  const dream = await prisma.dream.findUnique({
    where: { id: dreamId },
    select: {
      id: true,
      userId: true,
      title: true,
      domain: true,
      currentSkillLevel: true,
      description: true,
      motivationStatement: true,
      deadline: true,
      impactScore: true,
    },
  });

  if (!dream || dream.userId !== userId) {
    throw new Error('Dream not found');
  }

  // Define the strict, lean JSON schema. 
  // We removed confidence, estimatedMinutes, and redundant descriptions to save tokens.
  const system = `You are the DreamPlanner Elite Architecture Mentor.
Return STRICT JSON ONLY (no markdown) matching this exact shape:
{
  "milestones": [
    {
      "title": string,
      "category": string (a short domain category like "CS Fundamentals", "Web Development", "System Design", "Data Structures", etc.),
      "targetUserState": string,
      "difficultyLevel": number (strictly 1, 2, 3, 4, or 5)
    }
  ]
}

RULES:

1. ANTI-FLUFF: Do NOT generate administrative "to-do lists" (e.g., "Update Resume", "Buy running shoes").
2. PILLARS OF MASTERY: Milestones must represent major domain-specific accomplishments, not chores.
3. UNIVERSAL DOMAIN ADAPTATION: Analyze the Dream's domain perfectly. 
   - If Tech: Focus on architecture, algorithms, and deep systems.
   - If Fitness/Sports: Focus on physiological adaptations, technique, and strength phases.
   - If Creative/Arts: Focus on core techniques, theory, and portfolio execution.
   - If Business: Focus on market mechanics, product development, and scale.
4. PROGRESSIVE OVERLOAD (CRITICAL): The roadmap MUST build knowledge chronologically. Early Milestones must focus on Foundations (Difficulty 1-2) before advancing to later Milestones requiring Mastery (Difficulty 4-5). Do not give them a Level 5 milestone in Milestone 1.
5. TARGET USER STATE: Describe exactly what the user can physically DO, EXPLAIN, or BUILD to prove they mastered this node. Be highly specific (e.g., "Can architect a sharded database" or "Can squat 315lbs with perfect depth").
6. DIFFICULTY RUBRIC: strictly 1=Foundation, 2=Application, 3=Integration, 4=Advanced Execution, 5=Production Mastery.`;

  const user = `DREAM:
title: ${dream.title}
domain: ${dream.domain}
current_skill_level: ${dream.currentSkillLevel}
description: ${dream.description}
deadlineISO: ${dream.deadline.toISOString()}

Generate the roadmap.`;

  const start = Date.now();
  const resp = (await executeWithFallback(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      complexity: 'COMPLEX',
      jsonMode: true,
      temperature: 0.3,
      max_tokens: 2500,
    }
  )) as any;

  const raw = resp.choices?.[0]?.message?.content || '{}';
  
  await logger.info(
    'roadmap',
    `[GEN] ok=true ms=${Date.now() - start} chars=${String(raw).length}`,
    { dreamId, model: SAMBANOVA_MODEL, promptVersion },
    userId
  );

  let validated: z.infer<typeof RoadmapGenerationZodSchema>;
  try {
    const parsed = JSON.parse(raw);
    validated = RoadmapGenerationZodSchema.parse(parsed);
  } catch (error: any) {
    await logger.error('roadmap', `JSON Parse or Zod Validation Failed. Raw length: ${raw.length}`, { error: error.message });
    throw new ServiceUnavailableError('AI generated an invalid roadmap schema. Please try again.');
  }

  // Map the strict JSON back to our application requirements
  const milestones = validated.milestones
    .map((m, i) => {
      return {
        orderIndex: i + 1,
        title: m.title || `Milestone ${i + 1}`,
        description: m.category || '',
        completionCriteria: {},
        targetUserState: m.targetUserState || '',
        status: i === 0 ? RoadmapNodeStatus.IN_PROGRESS : RoadmapNodeStatus.PENDING,
        difficultyLevel: m.difficultyLevel,
      };
    });

  return {
    generationPromptVersion: promptVersion,
    milestones,
  };
}
