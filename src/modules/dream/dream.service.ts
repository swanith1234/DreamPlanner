import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { dreamValidator } from './dream.validator';
import {
  CreateDreamRequest,
  UpdateDreamRequest,
  ConfirmDreamRequest,
} from './dream.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { DreamStatus, TaskStatus, NotificationStatus } from '@prisma/client';
import { eventService } from '../event/event.service';

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
      const deadline = new Date(input.deadline);
      if (deadline <= new Date()) {
        throw new ValidationError('Deadline must be in the future');
      }
      updateData.deadline = deadline;
    }

    const updated = await prisma.dream.update({
      where: { id: dreamId },
      data: updateData,
    });

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
        description: input.description,
        motivationStatement: input.motivationStatement,
        deadline,
        impactScore: input.impactScore,
        status: DreamStatus.ACTIVE, // Default to ACTIVE instead of DRAFT per user request
      },
    });

    await logger.info(
      'dream',
      'Dream draft created',
      { dreamId: dream.id, title: input.title },
      userId
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

    await logger.info(
      'dream',
      'Dream confirmed and activated',
      {
        dreamId: updatedDream.id,
        checkpointsCount: updatedDream.checkpoints.length,
      },
      userId
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
}

export const dreamService = new DreamService();