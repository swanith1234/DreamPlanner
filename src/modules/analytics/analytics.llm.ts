import { groq, GROQ_MODEL } from '../../config/ai';
import { logger } from '../../utils/logger';
import { MotivationTone, InsightType, UserInsightSnapshot } from '@prisma/client';

export interface WeeklyInsightInput {
    userName: string;
    tone: MotivationTone;
    snapshot: UserInsightSnapshot;
    prevSnapshot?: UserInsightSnapshot;
}

export async function generateWeeklyInsight(input: WeeklyInsightInput): Promise<{
    insightType: InsightType;
    evidence: any;
    message: string; // The "Narrative"
}> {
    try {
        const { userName, tone, snapshot } = input;

        // Construct prompt
        const prompt = `
        You are IgniteMate, a behavioral productivity coach.
        You analyze users' weekly sprint data to generate powerful, personalized insights.
        Max 60 words. Speak directly to the user based on their Motivation Tone (${tone}).
        Use precise numbers from the data.
        Generate a Weekly Verdict for user: ${userName || 'Friend'}.
        
        DATA:
        - Active Days: ${snapshot.activeDays}/7
        - Discipline Score: ${snapshot.disciplineScore}/100
        - Consistency Score: ${snapshot.consistencyScore}/100
        - Execution Rate: ${Math.round((snapshot.totalCheckpointsCompleted / (snapshot.totalCheckpointsPlanned || 1)) * 100)}%
        - Missed Days: ${snapshot.missedDays}
        - Late Checkpoints: ${snapshot.lateCheckpoints}
        - Early Starts: ${snapshot.earlyStarts}
        - Overachievement Days: ${snapshot.overachievementDays}
        
        TONE PREFERENCE: ${tone}
        
        INSTRUCTIONS:
        1. Analyze the data to find the most significant pattern (Growth, Slump, Consistency, Break-Limits).
        2. Assign an InsightType from: TASK_AVOIDANCE_HIGH, PROCRASTINATION_PATTERN, MOTIVATION_DECAY, DREAM_RESTART_LOOP, HIGH_RESPONSE_LATENCY, TONE_MISMATCH, CONSISTENT_PROGRESS, TASK_OVERLOAD, DREAM_TASK_MISALIGNMENT, USER_REFLECTION_TRIGGER, WEEKLY_VERDICT.
           (Use WEEKLY_VERDICT if it's a general summary, or specific if a strong pattern exists).
        3. Write a short paragraph (2-3 sentences) explaining the verdict to the user.
           - If score > 80: Celebrate their "Elite" status.
           - If 50-79: Encourage recovery.
           - If < 50: Gentle reality check, focus on "showing up".
        4. Return JSON format.

        FORMAT:
        {
            "insightType": "WEEKLY_VERDICT",
            "message": "Your narrative here.",
            "evidence": { "keyMetric": "value" }
        }
        `;

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No content from LLM');

        const result = JSON.parse(content);

        return {
            insightType: result.insightType as InsightType || InsightType.WEEKLY_VERDICT,
            evidence: result.evidence || {},
            message: result.message
        };

    } catch (error: any) {
        logger.error('analytics-llm', 'Failed to generate weekly insight', { error: error.message });
        // Fallback
        return {
            insightType: InsightType.WEEKLY_VERDICT,
            evidence: {},
            message: "Your weekly analytics are ready. Review your dashboard to see how you performed."
        };
    }
}

export async function generateNextSprintPlan(input: {
    userName: string;
    tone: MotivationTone;
    roadmapTitle: string;
    upcomingMilestoneTitle?: string;
    upcomingSkills: Array<{ title: string; completionCriteria: any; difficulty: string }>;
    lastWeekSnapshot: UserInsightSnapshot;
}): Promise<{
    insightType: InsightType;
    evidence: any;
    message: string;
}> {
    try {
        const { userName, tone, roadmapTitle, upcomingMilestoneTitle, upcomingSkills, lastWeekSnapshot } = input;

        const prompt = `
You are IgniteMate, a sprint planner.
Goal: propose a next-week sprint plan derived from the user's roadmap and last week's performance.
Max 120 words. Be direct and actionable. Speak in Motivation Tone (${tone}).

ROADMAP: ${roadmapTitle}
UPCOMING_MILESTONE: ${upcomingMilestoneTitle || 'N/A'}
UPCOMING_SKILLS_JSON: ${JSON.stringify(upcomingSkills)}

LAST_WEEK:
- Active Days: ${lastWeekSnapshot.activeDays}/7
- Discipline Score: ${lastWeekSnapshot.disciplineScore}/100
- Execution Rate: ${lastWeekSnapshot.executionRate}%
- Recovery Rate: ${lastWeekSnapshot.recoveryRate}%

Return STRICT JSON:
{
  "insightType": "NEXT_SPRINT_PLAN",
  "message": "...",
  "evidence": { "skillsPicked": ["..."], "reasoning": ["..."] }
}
`;

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No content from LLM');
        const result = JSON.parse(content);

        return {
            insightType: InsightType.NEXT_SPRINT_PLAN,
            evidence: result.evidence || {},
            message: result.message || 'Next sprint plan generated.'
        };
    } catch (error: any) {
        logger.error('analytics-llm', 'Failed to generate next sprint plan', { error: error.message });
        return {
            insightType: InsightType.NEXT_SPRINT_PLAN,
            evidence: {},
            message: `Next sprint: pick 1-2 skills from your roadmap and do them daily for 45-60 minutes. Keep it small and consistent.`,
        };
    }
}
