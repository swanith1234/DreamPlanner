import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { generateRoadmapDraft } from './roadmap.generator';
import type { RoadmapDraftPayload } from './roadmap.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { DifficultyLevel, RoadmapNodeStatus, RoadmapSource, RoadmapStatus } from '@prisma/client';

const PROMPT_VERSION = 'roadmap.v1';

function toNullableDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class RoadmapService {
  async generate(userId: string, dreamId: string) {
    // ownership check
    const dream = await prisma.dream.findUnique({ where: { id: dreamId } });
    if (!dream || dream.userId !== userId) throw new NotFoundError('Dream');

    // archive existing drafts for this dream (keep ACTIVE)
    await prisma.roadmap.updateMany({
      where: { userId, dreamId, status: RoadmapStatus.DRAFT },
      data: { status: RoadmapStatus.ARCHIVED },
    });

    const draft = await generateRoadmapDraft({
      userId,
      dreamId,
      promptVersion: PROMPT_VERSION,
    });

    const roadmap = await prisma.roadmap.create({
      data: {
        userId,
        dreamId,
        status: RoadmapStatus.DRAFT,
        source: RoadmapSource.AI,
        generationModel: 'openrouter:' + (process.env.OPENROUTER_COMPLEX_MODEL || 'default'),
        generationPromptVersion: draft.generationPromptVersion || PROMPT_VERSION,
        milestones: {
          create: draft.milestones.map((m) => ({
            userId,
            orderIndex: m.orderIndex,
            startDate: toNullableDate(m.startDate),
            endDate: toNullableDate(m.endDate),
            title: m.title || '',
            description: m.description || '',
            completionCriteria: m.completionCriteria ?? {},
            confidence: Math.max(0, Math.min(100, m.confidence ?? 60)),
            estimatedMinutes: m.estimatedMinutes ?? null,
            difficulty: (m.difficulty as any) || null,
            difficultyLevel: m.difficultyLevel ?? 3,
            targetUserState: m.targetUserState || '',
            status: RoadmapNodeStatus.PENDING,
          })),
        },
      },
      include: {
        milestones: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    await logger.info('roadmap', 'Roadmap draft generated', { dreamId, roadmapId: roadmap.id }, userId);
    return roadmap;
  }

  async getActiveByDream(userId: string, dreamId: string) {
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId, dreamId, status: RoadmapStatus.ACTIVE },
      include: {
        milestones: { orderBy: { orderIndex: 'asc' }, include: { skills: { orderBy: { orderIndex: 'asc' } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return roadmap;
  }

  async getByDream(userId: string, dreamId: string) {
    const roadmaps = await prisma.roadmap.findMany({
      where: { userId, dreamId },
      include: {
        milestones: { orderBy: { orderIndex: 'asc' }, include: { skills: { orderBy: { orderIndex: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return roadmaps;
  }

  async getById(userId: string, roadmapId: string) {
    const roadmap = await prisma.roadmap.findUnique({
      where: { id: roadmapId },
      include: {
        milestones: { orderBy: { orderIndex: 'asc' }, include: { skills: { orderBy: { orderIndex: 'asc' } } } },
      },
    });
    if (!roadmap || roadmap.userId !== userId) throw new NotFoundError('Roadmap');
    return roadmap;
  }

  async updateDraft(userId: string, roadmapId: string, payload: RoadmapDraftPayload) {
    const existing = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!existing || existing.userId !== userId) throw new NotFoundError('Roadmap');
    if (existing.status !== RoadmapStatus.DRAFT) throw new ValidationError('Only DRAFT roadmaps can be edited');

    /**
     * Replace semantics (id-aware):
     * - Update existing nodes if `id` provided and belongs to this roadmap
     * - Create nodes when `id` missing
     * - Delete nodes removed from payload
     */
    await prisma.$transaction(async (tx) => {
      const existingMilestones = await tx.milestone.findMany({
        where: { userId, roadmapId },
        select: { id: true },
      });
      const existingMilestoneIds = new Set(existingMilestones.map((m) => m.id));

      const payloadMilestoneIds = new Set<string>();

      // 1) Upsert milestones (manual)
      for (const m of payload.milestones) {
        const milestoneData = {
          orderIndex: m.orderIndex,
          startDate: toNullableDate(m.startDate ?? null),
          endDate: toNullableDate(m.endDate ?? null),
          title: m.title || '',
          description: m.description || '',
          completionCriteria: m.completionCriteria ?? {},
          confidence: Math.max(0, Math.min(100, m.confidence ?? 60)),
          estimatedMinutes: m.estimatedMinutes ?? null,
          difficulty: (m.difficulty as any) || null,
          difficultyLevel: m.difficultyLevel ?? 3,
          targetUserState: m.targetUserState || '',
          status: (m.status as any) || RoadmapNodeStatus.PENDING,
        };

        let milestoneId: string;
        if (m.id && existingMilestoneIds.has(m.id)) {
          const updated = await tx.milestone.update({
            where: { id: m.id },
            data: milestoneData,
          });
          milestoneId = updated.id;
        } else {
          const created = await tx.milestone.create({
            data: { userId, roadmapId, ...milestoneData },
          });
          milestoneId = created.id;
        }

        payloadMilestoneIds.add(milestoneId);
      }

      // 4) Delete milestones removed (cascade deletes skills)
      const milestonesToDelete = existingMilestones
        .filter((m) => !payloadMilestoneIds.has(m.id))
        .map((m) => m.id);
      if (milestonesToDelete.length) {
        await tx.milestone.deleteMany({ where: { id: { in: milestonesToDelete } } });
      }

      await tx.roadmap.update({
        where: { id: roadmapId },
        data: { generationPromptVersion: payload.generationPromptVersion || existing.generationPromptVersion },
      });
    });

    await logger.info('roadmap', 'Roadmap draft updated', { roadmapId }, userId);
    return this.getById(userId, roadmapId);
  }

  async activate(userId: string, roadmapId: string) {
    const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap || roadmap.userId !== userId) throw new NotFoundError('Roadmap');
    if (roadmap.status !== RoadmapStatus.DRAFT) throw new ValidationError('Only DRAFT roadmaps can be activated');

    await prisma.$transaction(async (tx) => {
      await tx.roadmap.updateMany({
        where: { userId, dreamId: roadmap.dreamId, status: RoadmapStatus.ACTIVE },
        data: { status: RoadmapStatus.ARCHIVED },
      });
      await tx.roadmap.update({
        where: { id: roadmapId },
        data: { status: RoadmapStatus.ACTIVE, activatedAt: new Date() },
      });
    });

    await logger.info('roadmap', 'Roadmap activated', { roadmapId }, userId);
    return this.getById(userId, roadmapId);
  }

  async updateMilestone(userId: string, milestoneId: string, data: any) {
    const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.userId !== userId) throw new NotFoundError('Milestone');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.targetUserState !== undefined) updateData.targetUserState = data.targetUserState;
    if (data.difficultyLevel !== undefined) updateData.difficultyLevel = data.difficultyLevel;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'IN_PROGRESS' && !milestone.startDate) updateData.startDate = new Date();
      if (data.status === 'COMPLETED') updateData.completedAt = new Date();
      else if (data.status !== 'COMPLETED') updateData.completedAt = null;
    }

    return prisma.milestone.update({
      where: { id: milestoneId },
      data: updateData,
    });
  }

  async updateMilestoneStatus(userId: string, milestoneId: string, status: RoadmapNodeStatus) {
    const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.userId !== userId) throw new NotFoundError('Milestone');

    return prisma.milestone.update({
      where: { id: milestoneId },
      data: { 
        status,
        startDate: (status === RoadmapNodeStatus.IN_PROGRESS && !milestone.startDate) ? new Date() : milestone.startDate,
        completedAt: status === RoadmapNodeStatus.COMPLETED ? new Date() : null,
      },
    });
  }

  async updateSkill(userId: string, skillId: string, data: any) {
    const skill = await prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill || skill.userId !== userId) throw new NotFoundError('Skill');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.targetUserState !== undefined) updateData.targetUserState = data.targetUserState;
    if (data.difficultyLevel !== undefined) updateData.difficultyLevel = data.difficultyLevel;
    if (data.status !== undefined) updateData.status = data.status;

    return prisma.skill.update({
      where: { id: skillId },
      data: updateData,
    });
  }

  async updateSkillStatus(userId: string, skillId: string, status: RoadmapNodeStatus) {
    const skill = await prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill || skill.userId !== userId) throw new NotFoundError('Skill');

    const updated = await prisma.skill.update({
      where: { id: skillId },
      data: { 
        status,
        completedAt: status === RoadmapNodeStatus.COMPLETED ? new Date() : null,
      },
    });

    // If skill was just completed, check if milestone should auto-complete
    if (status === RoadmapNodeStatus.COMPLETED && skill.milestoneId) {
      await this.checkAndAutoCompleteMilestone(userId, skill.milestoneId);
    }

    return updated;
  }

  /**
   * Check if all skills under a milestone are COMPLETED.
   * If yes → auto-complete the milestone and advance the next one to IN_PROGRESS.
   */
  private async checkAndAutoCompleteMilestone(userId: string, milestoneId: string): Promise<void> {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { skills: true },
    });
    if (!milestone || milestone.userId !== userId) return;
    if (milestone.status === RoadmapNodeStatus.COMPLETED) return; // already done

    const allSkillsDone = milestone.skills.length > 0
      && milestone.skills.every(s => s.status === RoadmapNodeStatus.COMPLETED);

    if (!allSkillsDone) return;

    // Complete the milestone
    await prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: RoadmapNodeStatus.COMPLETED, completedAt: new Date() },
    });

    await logger.info('roadmap', 'Milestone auto-completed (all skills done)', { milestoneId }, userId);

    // Advance the NEXT pending milestone to IN_PROGRESS
    if (milestone.roadmapId) {
      const nextMilestone = await prisma.milestone.findFirst({
        where: {
          roadmapId: milestone.roadmapId,
          status: RoadmapNodeStatus.PENDING,
        },
        orderBy: { orderIndex: 'asc' },
      });
      if (nextMilestone) {
        await prisma.milestone.update({
          where: { id: nextMilestone.id },
          data: { status: RoadmapNodeStatus.IN_PROGRESS },
        });
        await logger.info('roadmap', 'Next milestone auto-advanced to IN_PROGRESS', { milestoneId: nextMilestone.id }, userId);
      }
    }
  }
}

export const roadmapService = new RoadmapService();

