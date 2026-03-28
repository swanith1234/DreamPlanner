
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { taskValidator } from './task.validator';
import { CreateTaskRequest, UpdateTaskRequest } from './task.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { TaskStatus, UserEventType } from '@prisma/client';
import { eventService } from '../event/event.service';
import { notificationService } from '../notification/notification.service';
import { userEventService } from '../event/user-event.service';


export class TaskService {

  // ── Derived active checkpoint ──────────────────────────────────────────────
  // ACTIVE = the first incomplete checkpoint ordered by orderIndex ASC.
  // Never stored; always computed from facts.
  private getActiveCheckpoint(checkpoints: any[]): any | null {
    return (
      checkpoints
        .filter(cp => !cp.isCompleted)
        .sort((a, b) => a.orderIndex - b.orderIndex)[0] || null
    );
  }

  async createTask(userId: string, input: CreateTaskRequest): Promise<any> {
    // Verify dream exists and belongs to user
    const dream = await prisma.dream.findUnique({ where: { id: input.dreamId } });
    if (!dream || dream.userId !== userId) throw new NotFoundError('Dream');

    const now = new Date();

    const deadline = new Date(input.deadline);
    if (deadline <= now) throw new ValidationError('Task deadline must be in the future');

    if (input.startDate) {
      const startDate = new Date(input.startDate);
      if (startDate < now) throw new ValidationError('Task start date cannot be in the past');
      if (startDate > deadline) throw new ValidationError('Start date cannot be after deadline');
    }

    // AI relevance check is intentionally skipped for now.
    // const validation = await taskValidator.validateTaskRelevance(...);

    if (input.skillId) {
      const skill = await prisma.skill.findUnique({ where: { id: input.skillId } });
      if (!skill) throw new NotFoundError('Skill not found');
    }

    if (input.milestoneId) {
      const milestone = await prisma.milestone.findUnique({ where: { id: input.milestoneId } });
      if (!milestone) throw new NotFoundError('Milestone not found');
    }

    // Create task + checkpoints (no stored "active" state — derived at read time)
    const task = await prisma.task.create({
      data: {
        userId,
        dreamId: input.dreamId,
        title: input.title,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        deadline,
        estimatedDuration: input.estimatedDuration,
        priority: input.priority,
        status: TaskStatus.PENDING,
        checkpoints: {
          create: (input.checkpoints ?? []).map(cp => {
            // Force YYYY-MM-DD to midday UTC so it never shifts calendar day
            // Extract the first 10 chars (YYYY-MM-DD) even if frontend sends full ISO.
            const dateStr = cp.targetDate.substring(0, 10);
            const safeDate = new Date(`${dateStr}T12:00:00Z`);
            return {
              title: cp.title,
              targetDate: safeDate,
              orderIndex: cp.orderIndex,
            };
          }),
        },
        skillLinks: input.skillId ? {
          create: { skillId: input.skillId }
        } : undefined,
        milestoneLinks: input.milestoneId ? {
          create: { milestoneId: input.milestoneId }
        } : undefined,
      },
    });

    await notificationService.schedulePreStartReminders(
      userId, task.id, input.dreamId, new Date(input.startDate || new Date())
    );

    await eventService.publishEvent('task.created', {
      taskId: task.id, dreamId: input.dreamId, userId,
      title: input.title, deadline: deadline.toISOString(), priority: input.priority,
    });

    await userEventService.logEvent(userId, UserEventType.TASK_CREATED, 'TASK', task.id, {
      dreamId: input.dreamId, title: input.title
    });

    await logger.info('task', 'Task created', { taskId: task.id, title: input.title }, userId);
    return task;
  }

  async updateTask(taskId: string, userId: string, input: UpdateTaskRequest): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');

    const updateData: any = {};
    if (input.title) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.startDate) updateData.startDate = new Date(input.startDate);
    if (input.deadline) updateData.deadline = new Date(input.deadline);
    if (input.estimatedDuration !== undefined) updateData.estimatedDuration = input.estimatedDuration;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.status) updateData.status = input.status;

    const updated = await prisma.task.update({ where: { id: taskId }, data: updateData });
    await logger.info('task', 'Task updated', { taskId, changes: Object.keys(input) }, userId);
    return updated;
  }

  async updateProgress(taskId: string, userId: string, progress: number): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { progressPercent: progress, lastProgressAt: new Date() },
    });

    await eventService.publishEvent('task.progress_updated', {
      taskId, dreamId: task.dreamId, userId, progress,
    });

    await logger.info('task', 'Task progress updated', { taskId, progress }, userId);
    return updated;
  }

  async completeTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
    });

    await eventService.publishEvent('task.completed', {
      taskId: updated.id, dreamId: task.dreamId, userId,
      completedAt: updated.completedAt?.toISOString(),
    });

    await userEventService.logEvent(userId, UserEventType.TASK_COMPLETED, 'TASK', taskId, {
      dreamId: task.dreamId
    });

    await logger.info('task', 'Task completed', { taskId }, userId);
    return updated;
  }

  async blockTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');
    return prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.BLOCKED } });
  }

  async archiveTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');
    return prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.ARCHIVED } });
  }

  async deleteTask(taskId: string, userId: string): Promise<void> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundError('Task');

    await prisma.$transaction(async (tx) => {
      // Gather all checkpoint IDs for this task
      const checkpoints = await tx.taskCheckpoint.findMany({
        where: { taskId },
        select: { id: true },
      });
      const checkpointIds = checkpoints.map(c => c.id);

      // 1. Delete Day rows
      if (checkpointIds.length > 0) {
        await tx.day.deleteMany({ where: { checkpointId: { in: checkpointIds } } });
      }

      // 2. Delete TaskCheckpoints
      await tx.taskCheckpoint.deleteMany({ where: { taskId } });

      // 3. Delete Notifications linked to this task
      await tx.notification.deleteMany({ where: { taskId } });

      // 4. Delete GeneratedInsights linked to this task
      await tx.generatedInsight.deleteMany({ where: { taskId } });

      // 5. Delete the Task
      await tx.task.delete({ where: { id: taskId } });
    });

    await logger.info('task', 'Task and all associated data permanently deleted', { taskId }, userId);
  }

  async deleteCheckpoint(taskId: string, checkpointId: string, userId: string): Promise<void> {
    // Verify task ownership
    await this.getTask(taskId, userId);

    // Verify checkpoint belongs to this task
    const checkpoint = await prisma.taskCheckpoint.findUnique({ where: { id: checkpointId } });
    if (!checkpoint || checkpoint.taskId !== taskId) throw new NotFoundError('Checkpoint');

    await prisma.$transaction(async (tx) => {
      // 1. Delete Day rows for this checkpoint
      await tx.day.deleteMany({ where: { checkpointId } });

      // 2. Delete the checkpoint
      await tx.taskCheckpoint.delete({ where: { id: checkpointId } });
    });

    // Recalculate task progress after checkpoint removal
    const refreshedTask = await this.getTask(taskId, userId);
    const total = refreshedTask.checkpoints.length;
    if (total > 0) {
      const sum = refreshedTask.checkpoints.reduce(
        (acc: number, cp: any) => acc + Math.min(cp.progress, 100), 0
      );
      await this.updateProgress(taskId, userId, Math.min(100, Math.round(sum / total)));
    } else {
      await this.updateProgress(taskId, userId, 0);
    }

    await logger.info('task', 'Checkpoint and Day data deleted', { taskId, checkpointId }, userId);
  }

  async updateCheckpoint(
    taskId: string,
    checkpointId: string,
    userId: string,
    data: { title?: string; targetDate?: string }
  ): Promise<any> {
    await this.getTask(taskId, userId); // ownership check

    const checkpoint = await prisma.taskCheckpoint.findUnique({ where: { id: checkpointId } });
    if (!checkpoint || checkpoint.taskId !== taskId) throw new NotFoundError('Checkpoint');

    const updateData: any = { isUserEdited: true };
    if (data.title) updateData.title = data.title;
    if (data.targetDate) {
      const dateStr = data.targetDate.substring(0, 10);
      updateData.targetDate = new Date(`${dateStr}T12:00:00Z`);
    }

    return prisma.taskCheckpoint.update({ where: { id: checkpointId }, data: updateData });
  }

  async updateCheckpointProgress(
    taskId: string,
    checkpointId: string,
    userId: string,
    delta: number,   // positive increment; backend accumulates
    localDate?: string  // YYYY-MM-DD from browser's local timezone (prevents server TZ mismatch)
  ): Promise<any> {
    const task = await this.getTask(taskId, userId); // includes checkpoints ordered by orderIndex ASC

    // ── Guard: only the derived-active checkpoint can be updated ──────────────
    const active = this.getActiveCheckpoint(task.checkpoints);
    if (!active || active.id !== checkpointId) {
      throw new ValidationError(
        'Only the first incomplete checkpoint can be updated.'
      );
    }

    const checkpoint = active; // same reference
    const now = new Date();

    // ── 1. Accumulate progress (cap at 100) ───────────────────────────────────
    const newProgress = Math.min(checkpoint.progress + delta, 100);
    const isCompleted = newProgress >= 100;

    await prisma.taskCheckpoint.update({
      where: { id: checkpointId },
      data: {
        progress: newProgress,
        isCompleted,
        ...(isCompleted && !checkpoint.isCompleted ? { completedAt: now } : {}),
      },
    });

    // ── 2. Upsert Day record (daily effort tracking) ──────────────────────────
    // Use the browser's local date (YYYY-MM-DD) if provided; this prevents server
    // timezone (UTC) from storing the wrong calendar date for non-UTC users (e.g. IST).
    // We store as midnight UTC of the user's local calendar date for consistent comparison.
    const todayStart = localDate
      ? new Date(`${localDate}T00:00:00.000Z`)   // browser local date → UTC midnight
      : new Date(now.toISOString().split('T')[0] + 'T00:00:00.000Z'); // fallback: UTC calendar date

    const existingDay = await prisma.day.findFirst({
      where: { userId, checkpointId, date: todayStart },
    });

    if (existingDay) {
      await prisma.day.update({
        where: { id: existingDay.id },
        data: { effort: existingDay.effort + delta },
      });
    } else {
      await prisma.day.create({
        data: {
          userId,
          checkpointId,
          date: todayStart,
          effort: delta,
          previousCheckpointProgress: checkpoint.progress, // snapshot before today's first delta
        },
      });
    }

    // ── 3. Log user events ────────────────────────────────────────────────────
    if (newProgress > 0 && checkpoint.progress === 0) {
      await userEventService.logEvent(
        userId, UserEventType.CHECKPOINT_STARTED, 'CHECKPOINT', checkpointId,
        { taskId, delta, newProgress }
      );
    }
    if (isCompleted && !checkpoint.isCompleted) {
      await userEventService.logEvent(
        userId, UserEventType.CHECKPOINT_COMPLETED, 'CHECKPOINT', checkpointId,
        { taskId, newProgress }
      );
    } else {
      await userEventService.logEvent(
        userId, UserEventType.CHECKPOINT_PROGRESS_UPDATED, 'CHECKPOINT', checkpointId,
        { taskId, delta, newProgress }
      );
    }

    // ── 4. Recalculate overall task progress ──────────────────────────────────
    const refreshedTask = await this.getTask(taskId, userId);
    const total = refreshedTask.checkpoints.length;

    if (total > 0) {
      const sum = refreshedTask.checkpoints.reduce(
        (acc: number, cp: any) => acc + Math.min(cp.progress, 100), 0
      );
      await this.updateProgress(taskId, userId, Math.min(100, Math.round(sum / total)));
    }

    return refreshedTask;
  }

  async getTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        checkpoints: { orderBy: { orderIndex: 'asc' } },
        dream: { select: { title: true, id: true } },
      },
    });

    if (!task || task.userId !== userId) throw new NotFoundError('Task');

    // ── Enrich each checkpoint with derived isActive flag ─────────────────────
    const active = this.getActiveCheckpoint(task.checkpoints);
    const enriched = {
      ...task,
      checkpoints: task.checkpoints.map((cp: any) => ({
        ...cp,
        isActive: active?.id === cp.id,
      })),
    };

    return enriched;
  }

  async listTasks(userId: string, dreamId?: string, status?: string): Promise<any[]> {
    return prisma.task.findMany({
      where: {
        userId,
        ...(dreamId && { dreamId }),
        ...(status && { status: status as TaskStatus }),
      },
      orderBy: { deadline: 'asc' },
    });
  }

  async searchTasks(
    userId: string,
    filter: { q?: string; dreamId?: string; status?: string }
  ): Promise<any[]> {
    const { q, dreamId, status } = filter;

    return prisma.task.findMany({
      where: {
        userId,
        ...(dreamId && { dreamId }),
        ...(status && { status: status as TaskStatus }),
        ...(q && {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        checkpoints: { orderBy: { orderIndex: 'asc' } },
        dream: { select: { title: true, id: true } },
      },
      orderBy: { deadline: 'asc' },
      take: 15,
    });
  }
}

export const taskService = new TaskService();