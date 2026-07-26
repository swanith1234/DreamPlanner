import prisma from '../../config/database';
import { generateEmbedding } from '../../lib/embeddings';
import { logger } from '../../utils/logger';
import { dreamValidator } from './dream.validator';
import {
  CreateDreamRequest,
  UpdateDreamRequest,
  ConfirmDreamRequest,
  SyncDreamStateRequest,
  SyncDreamStateResponse,
} from './dream.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { DreamStatus, TaskStatus, NotificationStatus } from '@prisma/client';
import { eventService } from '../event/event.service';
import { roadmapService } from '../roadmap/roadmap.service';
import { notificationService } from '../notification/notification.service';
import Redis from 'ioredis';
import { env } from '../../config/env';

// ── Dream Draft Redis (stateful slot-filling across turns) ────────────────────
let dreamDraftRedis: any = {
  get: async () => null,
  set: async () => null,
  del: async () => null,
};
try {
  const r = new Redis(env.redis.url, { maxRetriesPerRequest: 1, retryStrategy: () => null });
  r.on('error', () => { /* suppress */ });
  dreamDraftRedis = r;
} catch { /* fallback to no-op */ }

export class DreamService {
  async updateDream(
    dreamId: string,
    userId: string,
    input: Partial<CreateDreamRequest>
  ): Promise<any> {
    const dream = await this.getDream(dreamId, userId);

    const updateData: any = {};
    if (input.title) updateData.title = input.title;
    if (input.description) updateData.description = input.description;
    if (input.motivationStatement) updateData.motivationStatement = input.motivationStatement;
    if (input.deadline) {
      const newDeadline = new Date(input.deadline);
      const currentDeadline = new Date(dream.deadline);
      
      // Only validate if the deadline is actually being changed
      if (newDeadline.getTime() !== currentDeadline.getTime()) {
        if (newDeadline <= new Date()) {
          throw new ValidationError('Deadline must be in the future');
        }
        updateData.deadline = newDeadline;
      }
    }

    const updated = await prisma.dream.update({
      where: { id: dreamId },
      data: updateData,
    });

    if (input.title) {
        try {
            const queryEmbedding = await generateEmbedding(input.title);
            const embeddingStr = `[${queryEmbedding.join(',')}]`;
            await prisma.$executeRaw`UPDATE "Dream" SET "embedding" = ${embeddingStr}::vector WHERE "id" = ${dreamId}`;
        } catch (e) {}
    }

    await logger.info('dream', 'Dream updated', { dreamId }, userId);
    return updated;
  }

  async archiveDream(dreamId: string, userId: string): Promise<any> {
    // Verify ownership
    await this.getDream(dreamId, userId);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Archive the Dream
      const updatedDream = await tx.dream.update({
        where: { id: dreamId },
        data: { status: DreamStatus.ARCHIVED },
      });

      // 2. Archive all associated Tasks
      await tx.task.updateMany({
        where: { dreamId },
        data: { status: TaskStatus.ARCHIVED },
      });

      // 3. Archive/Cancel all PENDING notifications for this dream or its tasks
      await tx.notification.updateMany({
        where: {
          OR: [
            { dreamId },
            { task: { dreamId } } // Notifications linked to tasks of this dream
          ],
          status: { in: [NotificationStatus.SCHEDULED, NotificationStatus.PROCESSING] }
        },
        data: { status: NotificationStatus.ARCHIVED },
      });

      return updatedDream;
    });

    await logger.info('dream', 'Dream and related entities archived', { dreamId }, userId);
    return result;
  }

  async deleteDream(dreamId: string, userId: string): Promise<void> {
    // Verify ownership
    await this.getDream(dreamId, userId);

    await prisma.$transaction(async (tx) => {
      // Gather all task IDs for this dream
      const tasks = await tx.task.findMany({
        where: { dreamId },
        select: { id: true },
      });
      const taskIds = tasks.map(t => t.id);

      // Gather all checkpoint IDs for those tasks
      const checkpoints = await tx.taskCheckpoint.findMany({
        where: { taskId: { in: taskIds } },
        select: { id: true },
      });
      const checkpointIds = checkpoints.map(c => c.id);

      // 1. Delete Day rows (reference TaskCheckpoints)
      if (checkpointIds.length > 0) {
        await tx.day.deleteMany({ where: { checkpointId: { in: checkpointIds } } });
      }

      // 2. Delete TaskCheckpoints
      if (taskIds.length > 0) {
        await tx.taskCheckpoint.deleteMany({ where: { taskId: { in: taskIds } } });
      }

      // 3. Delete Notifications linked to dream or its tasks
      await tx.notification.deleteMany({
        where: { OR: [{ dreamId }, { taskId: { in: taskIds } }] },
      });

      // 4. Delete GeneratedInsights linked to dream or its tasks
      await tx.generatedInsight.deleteMany({
        where: { OR: [{ dreamId }, { taskId: { in: taskIds } }] },
      });

      // 5. Delete UserInsightSnapshots linked to dream
      await tx.userInsightSnapshot.deleteMany({ where: { dreamId } });

      // 6. Delete Tasks
      if (taskIds.length > 0) {
        await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      }

      // 7. Delete DreamCheckpoints
      await tx.dreamCheckpoint.deleteMany({ where: { dreamId } });

      // 8. Delete the Dream itself
      await tx.dream.delete({ where: { id: dreamId } });
    }, {
      maxWait: 5000,
      timeout: 20000,
    });

    await logger.info('dream', 'Dream and all associated data permanently deleted', { dreamId }, userId);
  }

  async createDraft(
    userId: string,
    input: CreateDreamRequest
  ): Promise<any> {
    const deadline = new Date(input.deadline);

    if (deadline <= new Date()) {
      throw new ValidationError('Deadline must be in the future');
    }

    const dream = await prisma.dream.create({
      data: {
        userId,
        title: input.title,
        domain: input.domain,
        targetGoal: input.targetGoal,
        currentSkillLevel: input.currentSkillLevel,
        description: input.description,
        motivationStatement: input.motivationStatement,
        deadline,
        impactScore: input.impactScore ?? 5,
        additionalContext: input.additionalContext,
        status: DreamStatus.ACTIVE, // Default to ACTIVE instead of DRAFT per user request
      },
    });

    try {
        const queryEmbedding = await generateEmbedding(input.title);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        await prisma.$executeRaw`UPDATE "Dream" SET "embedding" = ${embeddingStr}::vector WHERE "id" = ${dream.id}`;
    } catch (e: any) {}

    await logger.info(
      'dream',
      'Dream draft created',
      { dreamId: dream.id, title: input.title },
      userId
    );

    // Generate Roadmap Draft in background
    roadmapService.generate(userId, dream.id).catch(err => {
      logger.error('dream', 'Automatic roadmap generation failed (draft)', { dreamId: dream.id, error: err.message });
    });

    // Schedule the very first notification cycle tied to this Dream
    await notificationService.schedulePreStartReminders(
      userId, 
      null, 
      dream.id, 
      dream.createdAt
    );

    return dream;
  }

  async validateDream(dreamId: string, userId: string): Promise<any> {
    const dream = await prisma.dream.findUnique({
      where: { id: dreamId },
    });

    if (!dream || dream.userId !== userId) {
      throw new NotFoundError('Dream');
    }

    if (dream.status !== DreamStatus.DRAFT && dream.status !== DreamStatus.ACTIVE) {
      throw new ValidationError('Can only validate DRAFT or ACTIVE dreams');
    }

    const validation = await dreamValidator.validateDreamContent(
      dream.title,
      dream.description,
      dream.deadline,
      dream.motivationStatement || undefined
    );

    await logger.info(
      'dream',
      'Dream validated',
      { dreamId, isValid: validation.isValid },
      userId
    );

    return {
      dream,
      validation,
    };
  }

  async confirmDream(
    dreamId: string,
    userId: string,
    input: ConfirmDreamRequest
  ): Promise<any> {
    const dream = await prisma.dream.findUnique({
      where: { id: dreamId },
    });

    if (!dream || dream.userId !== userId) {
      throw new NotFoundError('Dream');
    }

    if (dream.status !== DreamStatus.DRAFT && dream.status !== DreamStatus.ACTIVE) {
      throw new ValidationError('Can only confirm DRAFT or ACTIVE dreams');
    }

    // Update dream status and checkpoints
    const updatedDream = await prisma.dream.update({
      where: { id: dreamId },
      data: {
        status: DreamStatus.ACTIVE,
        checkpoints: {
          deleteMany: {},
          create: input.checkpoints.map((cp) => ({
            title: cp.title,
            description: cp.description,
            expectedEffort: cp.expectedEffort,
            miniDeadline: cp.miniDeadline ? new Date(cp.miniDeadline) : undefined,
            orderIndex: cp.orderIndex,
            isUserModified: !!cp.id, // If had ID, user modified it
          })),
        },
      },
      include: { checkpoints: true },
    });

    // Publish event for notification scheduling
    await eventService.publishEvent('dream.created', {
      dreamId: updatedDream.id,
      userId,
      title: updatedDream.title,
      deadline: updatedDream.deadline.toISOString(),
    });

    // Trigger roadmap generation
    roadmapService.generate(userId, updatedDream.id).catch(err => {
      logger.error('dream', 'Automatic roadmap generation failed', { dreamId: updatedDream.id, error: err.message });
    });

    // Schedule the very first notification cycle tied to this Dream
    await notificationService.schedulePreStartReminders(
      userId, 
      null, 
      updatedDream.id, 
      updatedDream.createdAt
    );

    return updatedDream;
  }

  async getDream(dreamId: string, userId: string): Promise<any> {
    const dream = await prisma.dream.findUnique({
      where: { id: dreamId },
      include: { checkpoints: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!dream || dream.userId !== userId) {
      throw new NotFoundError('Dream');
    }

    return dream;
  }

  async listDreams(userId: string, status?: string): Promise<any[]> {
    const whereClause: any = { userId };

    if (status) {
      whereClause.status = status as DreamStatus;
    } else {
      // Default behavior: Exclude ARCHIVED dreams
      whereClause.status = { not: DreamStatus.ARCHIVED };
    }

    return prisma.dream.findMany({
      where: whereClause,
      include: { checkpoints: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async completeDream(dreamId: string, userId: string): Promise<any> {
    const dream = await this.getDream(dreamId, userId);

    const updated = await prisma.dream.update({
      where: { id: dreamId },
      data: { status: DreamStatus.COMPLETED },
    });

    await eventService.publishEvent('dream.completed', {
      dreamId: updated.id,
      userId,
    });

    await logger.info('dream', 'Dream completed', { dreamId }, userId);

    return updated;
  }

  async failDream(dreamId: string, userId: string): Promise<any> {
    const dream = await this.getDream(dreamId, userId);

    const updated = await prisma.dream.update({
      where: { id: dreamId },
      data: { status: DreamStatus.FAILED },
    });

    await logger.info('dream', 'Dream failed', { dreamId }, userId);

    return updated;
  }

  async searchDreams(
    userId: string,
    keyword?: string,
    status?: string
  ): Promise<any[]> {
    const where: any = { userId };

    if (status) {
      where.status = status as DreamStatus;
    } else {
      // Default to ACTIVE and DRAFT for search to keep LLM context clean
      where.status = { in: [DreamStatus.ACTIVE, DreamStatus.DRAFT] };
    }

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { domain: { contains: keyword, mode: 'insensitive' } },
        { targetGoal: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    return prisma.dream.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        domain: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async clearDraft(userId: string): Promise<void> {
    const DRAFT_KEY = `dream:draft:${userId}`;
    try {
      await dreamDraftRedis.del(DRAFT_KEY);
    } catch {}
  }

  async syncDreamState(
    userId: string,
    input: SyncDreamStateRequest
  ): Promise<SyncDreamStateResponse> {

    // ── 1. Load existing draft from Redis ──────────────────────────────────
    const DRAFT_KEY = `dream:draft:${userId}`;
    let draft: Record<string, any> = {};
    try {
      const raw = await dreamDraftRedis.get(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { /* Redis unavailable — start fresh */ }

    // ── 2. Reset draft if user is starting a NEW dream (different title) ───
    if (input.title && draft.title && input.title.toLowerCase() !== draft.title.toLowerCase()) {
      draft = {}; // clear stale draft, start fresh
      await logger.info('dream', 'Dream draft reset — new title detected', { userId }, userId);
    }

    // ── 3. Merge any non-null fields from this call into the draft ─────────
    const FIELDS = ['title', 'domain', 'targetGoal', 'currentSkillLevel', 'deadline', 'motivationStatement', 'impactScore', 'additionalContext'] as const;
    for (const field of FIELDS) {
      const val = (input as any)[field];
      if (val !== null && val !== undefined && val !== '') {
        draft[field] = val;
      }
    }

    // ── 3. Persist updated draft ───────────────────────────────────────────
    try {
      await dreamDraftRedis.set(DRAFT_KEY, JSON.stringify(draft), 'EX', 1800); // 30 min TTL
    } catch { /* Redis unavailable */ }

    // ── 4. Check which required fields are still missing or invalid ───────
    const REQUIRED = ['title', 'domain', 'targetGoal', 'currentSkillLevel', 'deadline', 'motivationStatement'] as const;
    const missingFields = REQUIRED.filter(f => !draft[f]);

    // Handle initial field collection
    if (missingFields.length > 0) {
      const [nextField] = missingFields;
      const fieldLabels: Record<string, string> = {
        title: 'the name of this dream',
        domain: 'the domain or field',
        targetGoal: 'the specific, measurable goal',
        currentSkillLevel: 'your current skill level',
        deadline: 'the target deadline (YYYY-MM-DD)',
        motivationStatement: 'your emotional motivation',
      };
      return {
        status: 'INCOMPLETE',
        missingFields,
        collected: draft,
        systemInstruction: `Ask for "${fieldLabels[nextField]}". One short sentence only.`,
      };
    }

    // ── 5. Data Type Validation (Deadline) ───────────────────────────────
    const deadlineDate = new Date(draft.deadline);
    if (isNaN(deadlineDate.getTime())) {
      return {
        status: 'INCOMPLETE',
        missingFields: ['deadline'],
        collected: draft,
        systemInstruction: 'The deadline provided is invalid. Please ask for a specific date in YYYY-MM-DD format.',
      };
    }

    // ── 6. Intent Validation (The "Real Dream" Check) ────────────────────
    const validation = await dreamValidator.validateDreamContent(
      draft.title,
      draft.targetGoal, // Use targetGoal as the description for validation
      deadlineDate,
      draft.motivationStatement
    );

    if (!validation.isValid) {
      return {
        status: 'INVALID',
        collected: draft,
        reason: validation.warnings[0] || "This goal seems a bit vague or unrealistic.",
        warnings: validation.warnings,
        systemInstruction: "Explain why it's invalid (politely) and ask the user to refine the dream details.",
      };
    }

    // ── 7. Confirmation Gate ─────────────────────────────────────────────
    if (!input.confirmed) {
      return {
        status: 'PENDING_CONFIRMATION',
        collected: draft,
        warnings: validation.warnings,
        suggestedCheckpoints: validation.suggestedCheckpoints,
        systemInstruction: "ALL FIELDS COLLECTED AND VALID. Summarize the dream and checkpoints, then ASK: 'Should I create this dream now?' Do NOT create until they say yes.",
      };
    }

    // ── 8. Final Creation ────────────────────────────────────────────────
    // Clear the draft
    try { await dreamDraftRedis.del(DRAFT_KEY); } catch { /* ignore */ }

    const dream = await prisma.dream.create({
      data: {
        userId,
        title: draft.title,
        domain: draft.domain,
        targetGoal: draft.targetGoal,
        currentSkillLevel: draft.currentSkillLevel,
        description: draft.targetGoal, 
        motivationStatement: draft.motivationStatement,
        deadline: deadlineDate,
        impactScore: draft.impactScore || 5,
        additionalContext: draft.additionalContext,
        status: DreamStatus.ACTIVE,
      },
    });

    try {
        const queryEmbedding = await generateEmbedding(draft.title);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        await prisma.$executeRaw`UPDATE "Dream" SET "embedding" = ${embeddingStr}::vector WHERE "id" = ${dream.id}`;
    } catch (e: any) {}

    await logger.info('dream', 'Dream created via syncDreamState (Confirmed)', { dreamId: dream.id }, userId);

    // Schedule the very first notification cycle tied to this Dream
    await notificationService.schedulePreStartReminders(
      userId, 
      null as any, // Task ID is null
      dream.id, 
      dream.createdAt
    );

    // Trigger roadmap generation
    const roadmap = await roadmapService.generate(userId, dream.id);

    return {
      status: 'COMPLETE',
      dreamId: dream.id,
      roadmap,
      systemInstruction: 'Dream and roadmap created. Tell the user it is setup and ask if they want to see the roadmap.',
    };
  }
}

export const dreamService = new DreamService();