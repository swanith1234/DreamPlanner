import { executeWithFallback } from '../../ai/llmClient';
import { logger } from '../../utils/logger';

export type GeneratedAssessment = {
  questionSet: any;
  minPassingScore: number;
};

export async function generateAssessmentFromCriteria(params: {
  userId: string;
  title: string;
  description: string;
  completionCriteria: any;
}): Promise<GeneratedAssessment> {
  const { userId, title, description, completionCriteria } = params;

  const system = `You are a high-fidelity Assessment Generator for DreamPlanner.
Return STRICT JSON ONLY with exactly this shape:
{
  "minPassingScore": 100,
  "questionSet": {
    "instructions": string,
    "questions": [
      {
        "id": string (unique slug),
        "prompt": string (the actual question),
        "options": [string, string, string, string],
        "correctAnswerIndex": number (0-3)
      }
    ]
  }
}

Rules:
- Generate strictly Multiple Choice Questions (MCQs) with exactly 4 options.
- The questions must rigorously test the provided Completion Criteria and Domain.
- Create exactly 3-5 questions.
- No explanation is needed in the output, just the exact JSON.`;

  const user = `TITLE: ${title}
DESCRIPTION: ${description}
COMPLETION_CRITERIA_JSON: ${JSON.stringify(completionCriteria)}
`;

  const start = Date.now();
  const resp = (await executeWithFallback(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      complexity: 'COMPLEX',
      jsonMode: true,
      temperature: 0.2,
      max_tokens: 1500,
    }
  )) as any;

  const raw = resp.choices?.[0]?.message?.content || '{}';
  await logger.info('assessment', `[GEN] ok=true ms=${Date.now() - start} chars=${String(raw).length}`, {}, userId);

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    questionSet: parsed.questionSet ?? { instructions: 'Answer all questions.', questions: [] },
    minPassingScore: Number.isFinite(parsed.minPassingScore) ? parsed.minPassingScore : 100,
  };
}

