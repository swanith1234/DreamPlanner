import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { dreamValidator } from './dream.validator';
import {
  CreateDreamRequest,
  UpdateDreamRequest,
  ConfirmDreamRequest,
} from './dream.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { DreamStatus } from '@prisma/client';
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
    const dream = await this.getDream(dreamId, userId);

    const updated = await prisma.dream.update({
      where: { id: dreamId },
      data: { status: DreamStatus.ARCHIVED },
    });

    await logger.info('dream', 'Dream archived', { dreamId }, userId);
    return updated;
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
        status: DreamStatus.DRAFT,
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

    if (dream.status !== DreamStatus.DRAFT) {
      throw new ValidationError('Can only validate DRAFT dreams');
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

    if (dream.status !== DreamStatus.DRAFT) {
      throw new ValidationError('Can only confirm DRAFT dreams');
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
    return prisma.dream.findMany({
      where: {
        userId,
        ...(status && { status: status as DreamStatus }),
      },
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