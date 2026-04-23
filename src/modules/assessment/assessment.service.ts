import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { generateAssessmentFromCriteria } from './assessment.generator';
import { AssessmentStatus, RoadmapEntityType, RoadmapNodeStatus, RevisionStatus } from '@prisma/client';

export class AssessmentService {
  private async recordTimeGap(userId: string, entityType: RoadmapEntityType, entityId: string, fromStatus: RoadmapNodeStatus, toStatus: RoadmapNodeStatus) {
    // best-effort evidence record; do not block core flow
    try {
      const now = new Date();
      await prisma.timeGapEvidence.create({
        data: {
          userId,
          entityType,
          entityId,
          fromStatus,
          toStatus,
          elapsedMinutes: 0,
          context: { at: now.toISOString() },
        },
      });
    } catch {
      // ignore
    }
  }

  async getOrCreateAssessment(userId: string, milestoneId: string) {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { roadmap: true },
    });
    if (!milestone || milestone.userId !== userId) throw new NotFoundError('Milestone');
    if (milestone.status === RoadmapNodeStatus.COMPLETED) throw new ValidationError('Milestone already completed');

    // Check if an assessment already exists
    const existing = await prisma.assessment.findFirst({
      where: {
        userId,
        entityType: RoadmapEntityType.MILESTONE,
        entityId: milestoneId,
      },
      orderBy: { createdAt: 'desc' },
      include: { attempts: { orderBy: { evaluatedAt: 'desc' } } },
    });

    if (existing) {
      return existing;
    }

    // Generate on the fly
    const generated = await generateAssessmentFromCriteria({
      userId,
      title: milestone.title,
      description: milestone.description || '',
      completionCriteria: milestone.completionCriteria,
    });

    const assessment = await prisma.assessment.create({
      data: {
        userId,
        roadmapId: milestone.roadmapId,
        entityType: RoadmapEntityType.MILESTONE,
        entityId: milestone.id,
        questionSet: generated.questionSet,
        rubric: {}, // Obsolete with direct MCQ Match
        minPassingScore: generated.minPassingScore,
        status: AssessmentStatus.DRAFT,
      },
    });

    await logger.info('assessment', 'Assessment generated on the fly for milestone', { assessmentId: assessment.id, milestoneId }, userId);
    return { ...assessment, attempts: [] };
  }

  async getAssessment(userId: string, assessmentId: string) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { attempts: { orderBy: { evaluatedAt: 'desc' } } },
    });
    if (!assessment || assessment.userId !== userId) throw new NotFoundError('Assessment');
    return assessment;
  }

  async submitAttempt(userId: string, assessmentId: string, answers: any) {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment || assessment.userId !== userId) throw new NotFoundError('Assessment');

    const questionSet = assessment.questionSet as any;
    const questions: any[] = Array.isArray(questionSet?.questions) ? questionSet.questions : [];

    const evidence: any = { checks: [] as any[] };
    let correctCount = 0;

    for (const q of questions) {
      const qId = String(q.id || '');
      const expected = Number(q.correctAnswerIndex);
      const userAnswer = Number((answers || {})[qId] ?? -1);

      const isCorrect = userAnswer === expected;
      evidence.checks.push({ questionId: qId, expected, passed: userAnswer, isCorrect });
      if (isCorrect) correctCount++;
    }

    const _total = questions.length || 1;
    const score = Math.round((correctCount / _total) * 100);
    const passed = score >= assessment.minPassingScore;

    const attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId,
        answers,
        score,
        evidence,
      },
    });

    const newStatus = passed ? AssessmentStatus.PASSED : AssessmentStatus.FAILED;
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: newStatus },
    });

    if (passed) {
      const before = await prisma.milestone.findUnique({ where: { id: assessment.entityId }, select: { status: true } });
      await prisma.milestone.update({
        where: { id: assessment.entityId },
        data: { status: RoadmapNodeStatus.COMPLETED, completedAt: new Date() },
      });
      if (before?.status) {
        await this.recordTimeGap(userId, RoadmapEntityType.MILESTONE, assessment.entityId, before.status, RoadmapNodeStatus.COMPLETED);
      }
    } else {
      const before = await prisma.milestone.findUnique({ where: { id: assessment.entityId }, select: { status: true } });
      await prisma.milestone.update({
        where: { id: assessment.entityId },
        data: { status: RoadmapNodeStatus.FAILED },
      });
      if (before?.status) {
        await this.recordTimeGap(userId, RoadmapEntityType.MILESTONE, assessment.entityId, before.status, RoadmapNodeStatus.FAILED);
      }
    }

    await logger.info('assessment', 'Assessment attempt evaluated', { assessmentId, score }, userId);
    return { attempt, status: newStatus, score };
  }

  async createRevision(userId: string, roadmapId: string, entityType: RoadmapEntityType, entityId: string, reason: string, dueDate?: string) {
    const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap || roadmap.userId !== userId) throw new NotFoundError('Roadmap');

    const rev = await prisma.revisionItem.create({
      data: {
        userId,
        roadmapId,
        entityType,
        entityId,
        reason,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: RevisionStatus.OPEN,
      },
    });
    await logger.info('assessment', 'Revision item created', { revisionId: rev.id }, userId);
    return rev;
  }
}

export const assessmentService = new AssessmentService();

