
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { taskValidator } from './task.validator';
import { CreateTaskRequest, UpdateTaskRequest } from './task.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { TaskStatus, CheckpointStatus, UserEventType } from '@prisma/client';
import { eventService } from '../event/event.service';
import { notificationService } from '../notification/notification.service';
import { userEventService } from '../event/user-event.service';
import { startOfDay, isBefore, isSameDay, isAfter } from 'date-fns';

export class TaskService {

  private calculateCheckpointStatus(targetDate: Date, progress: number, isCompleted: boolean): CheckpointStatus {
    const now = new Date();
    const today = startOfDay(now);
    const target = startOfDay(targetDate);

    if (isCompleted) {
      return CheckpointStatus.COMPLETED;
    }

    if (isAfter(target, today)) {
      if (progress > 0) {
        return CheckpointStatus.EARLY_STARTED;
      }
      return CheckpointStatus.NOT_STARTED;
    }

    if (isSameDay(target, today)) {
      return CheckpointStatus.ACTIVE;
    }

    // target < today
    return CheckpointStatus.DUE;
  }

  async createTask(userId: string, input: CreateTaskRequest): Promise<any> {
    // Verify dream exists and is active
    const dream = await prisma.dream.findUnique({
      where: { id: input.dreamId },
    });

    if (!dream || dream.userId !== userId) {
      throw new NotFoundError('Dream');
    }

    const now = new Date();

    // Validate deadline
    const deadline = new Date(input.deadline);
    if (deadline <= now) {
      throw new ValidationError('Task deadline must be in the future');
    }

    // Validate start date
    if (input.startDate) {
      const startDate = new Date(input.startDate);

      if (startDate < now) {
        throw new ValidationError('Task start date cannot be in the past');
      }

      if (startDate > deadline) {
        throw new ValidationError('Start date cannot be after deadline');
      }
    }

    // AI validation
    const validation = await taskValidator.validateTaskRelevance(
      dream.title,
      dream.description,
      input.title,
      input.description || ''
    );

    if (!validation.isValid) {
      throw new ValidationError(`Task does not align with dream: ${validation.feedback}`);
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        userId,
        dreamId: input.dreamId,
        title: input.title,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : new Date(),
        deadline,
        estimatedDuration: input.estimatedDuration,
        priority: input.priority,
        status: TaskStatus.PENDING,
        checkpoints: {
          create: input.checkpoints?.map((cp) => {
            const targetDate = new Date(cp.targetDate);
            return {
              title: cp.title,
              targetDate,
              orderIndex: cp.orderIndex,
              status: this.calculateCheckpointStatus(targetDate, 0, false)
            };
          }),
        },
      },
    });

    // Schedule notifications
    await notificationService.schedulePreStartReminders(
      userId,
      task.id,
      input.dreamId,
      new Date(input.startDate || new Date())
    );

    // Publish event
    await eventService.publishEvent('task.created', {
      taskId: task.id,
      dreamId: input.dreamId,
      userId,
      title: input.title,
      deadline: deadline.toISOString(),
      priority: input.priority,
    });

    // Log User Event
    await userEventService.logEvent(userId, UserEventType.TASK_CREATED, 'TASK', task.id, {
      dreamId: input.dreamId,
      title: input.title
    });

    await logger.info(
      'task',
      'Task created',
      { taskId: task.id, title: input.title },
      userId
    );

    return task;
  }

  async updateTask(
    taskId: string,
    userId: string,
    input: UpdateTaskRequest
  ): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    const updateData: any = {};
    if (input.title) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.startDate) updateData.startDate = new Date(input.startDate);
    if (input.deadline) updateData.deadline = new Date(input.deadline);
    if (input.estimatedDuration !== undefined)
      updateData.estimatedDuration = input.estimatedDuration;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.status) updateData.status = input.status;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    await logger.info(
      'task',
      'Task updated',
      { taskId, changes: Object.keys(input) },
      userId
    );

    return updated;
  }

  async updateProgress(
    taskId: string,
    userId: string,
    progress: number
  ): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        progressPercent: progress,
        lastProgressAt: new Date(),
        // Auto-complete if 100%? Plan doesn't specify, but implied.
        // Let's stick to explicit completion or progress.
        // If 100%, user might still want to mark complete manually.
        // User "Do NOT send instant follow-up".
      },
    });

    // Log User Event
    // This method is called by updateCheckpointProgress as well, duplicate event?
    // updateCheckpointProgress emits CHECKPOINT events.
    // This emits TASK events if called directly, or if we consider task progress update separate.
    // "Emit Events On: Every progress update".
    // If specific checkpoint update -> CHECKPOINT_PROGRESS_UPDATED.
    // If general task progress update (legacy?) -> UserEventType doesn't have TASK_PROGRESS_UPDATED.
    // UserEventType has: CHECKPOINT_PROGRESS_UPDATED.
    // Wait, UserEventType has: TASK_CREATED, CHECKPOINT_STARTED, CHECKPOINT_PROGRESS_UPDATED, CHECKPOINT_COMPLETED, TASK_COMPLETED.
    // Use metadata to discern? Or maybe we map Task Progress to what?
    // If the UI allows updating Task Progress directly (without checkpoints), we have a gap in Enum.
    // But Phase 2 focuses on Checkpoints.
    // I will log it as CHECKPOINT_PROGRESS_UPDATED with null checkpointId in metadata if needed, 
    // or just rely on DomainEvent 'task.progress_updated' for legacy, and not emit UserEvent if strict enum doesn't support it.
    // Actually, let's check Enum: CHECKPOINT_PROGRESS_UPDATED.
    // If I update task progress directly, is it a "Checkpoint"? No.
    // But maybe for the purpose of "Day with no activity", I should emit something.
    // I will skip UserEvent here if it's not a checkpoint update, OR I will assume this is only called by updateCheckpointProgress in the new flow.
    // But `updateProgress` is public.
    // Leaving it for now, as `updateCheckpointProgress` calls it.

    await eventService.publishEvent('task.progress_updated', {
      taskId,
      dreamId: task.dreamId,
      userId,
      progress,
    });

    await logger.info(
      'task',
      'Task progress updated',
      { taskId, progress },
      userId
    );

    return updated;
  }

  async completeTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // Publish event for analytics & motivational message
    await eventService.publishEvent('task.completed', {
      taskId: updated.id,
      dreamId: task.dreamId,
      userId,
      completedAt: updated.completedAt?.toISOString(),
    });

    // Log User Event
    await userEventService.logEvent(userId, UserEventType.TASK_COMPLETED, 'TASK', taskId, {
      dreamId: task.dreamId
    });

    await logger.info('task', 'Task completed', { taskId }, userId);

    return updated;
  }

  async blockTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    return prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.BLOCKED },
    });
  }

  async archiveTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    return prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.ARCHIVED },
    });
  }

  async updateCheckpoint(
    taskId: string,
    checkpointId: string,
    userId: string,
    data: { title?: string; targetDate?: string }
  ): Promise<any> {
    const task = await this.getTask(taskId, userId); // Verifies ownership

    const checkpoint = await prisma.taskCheckpoint.findUnique({
      where: { id: checkpointId },
    });

    if (!checkpoint || checkpoint.taskId !== taskId) {
      throw new NotFoundError('Checkpoint');
    }

    const updateData: any = {};
    if (data.title) updateData.title = data.title;

    // Recalculate status if date changes
    if (data.targetDate) {
      updateData.targetDate = new Date(data.targetDate);
      updateData.status = this.calculateCheckpointStatus(
        updateData.targetDate,
        checkpoint.progress,
        checkpoint.isCompleted
      );
    }

    updateData.isUserEdited = true;

    return prisma.taskCheckpoint.update({
      where: { id: checkpointId },
      data: updateData,
    });
  }

  async updateCheckpointProgress(
    taskId: string,
    checkpointId: string,
    userId: string,
    progress: number
  ): Promise<any> {
    const task = await this.getTask(taskId, userId); // Verifies ownership

    const checkpoint = await prisma.taskCheckpoint.findUnique({
      where: { id: checkpointId }
    });

    if (!checkpoint) throw new NotFoundError('Checkpoint');

    const isCompleted = progress >= 100; // Allow > 100

    // Determine if started early
    // "progress before targetDate".
    // If it was already started early, keep it?
    // "startedEarly Boolean @default(false)"
    // Logic: if now < targetDate (start of day?) AND progress > 0.
    const now = new Date();
    const target = startOfDay(checkpoint.targetDate);
    const today = startOfDay(now);

    let startedEarly = checkpoint.startedEarly;
    if (!startedEarly && progress > 0 && isBefore(today, target)) {
      startedEarly = true;
    }

    const status = this.calculateCheckpointStatus(checkpoint.targetDate, progress, isCompleted);

    // 1. Update the triggered checkpoint
    const updatedCheckpoint = await prisma.taskCheckpoint.update({
      where: { id: checkpointId },
      data: {
        progress,
        isCompleted,
        status,
        startedEarly
      },
    });

    // Emit User Events
    if (progress > 0 && checkpoint.progress === 0) {
      await userEventService.logEvent(userId, UserEventType.CHECKPOINT_STARTED, 'CHECKPOINT', checkpointId, { taskId, progress });
    }

    if (isCompleted && !checkpoint.isCompleted) {
      await userEventService.logEvent(userId, UserEventType.CHECKPOINT_COMPLETED, 'CHECKPOINT', checkpointId, { taskId, progress });
    } else {
      await userEventService.logEvent(userId, UserEventType.CHECKPOINT_PROGRESS_UPDATED, 'CHECKPOINT', checkpointId, { taskId, progress });
    }


    // 2. Fetch all checkpoints to calculate new progress
    const updatedTask = await this.getTask(taskId, userId);
    const totalCheckpoints = updatedTask.checkpoints.length;

    if (totalCheckpoints > 0) {
      // Calculate average progress of all checkpoints
      const totalProgressSum = updatedTask.checkpoints.reduce(
        (sum: number, cp: any) => sum + (cp.progress > 100 ? 100 : cp.progress), // Cap at 100 for task average? Or allow task > 100? Usually task progress is 0-100 cap. CP can correspond to 120% effort.
        0
      );
      // Wait, if CP progress is 150%, and I have 1 CP, task progress = 150%?
      // Prompt says: "progress > 100 = break-limits behavior".
      // "Task.progressPercent Int? // 0–100".
      // So Task progress should probably be capped at 100 for storage in Task model if it's strictly 0-100?
      // Or I can store > 100? The comment says "0-100".
      // Use Math.min(100, ...).

      const newProgress = Math.min(100, Math.round(totalProgressSum / totalCheckpoints));

      // 3. Update task progress
      await this.updateProgress(taskId, userId, newProgress);

      return updatedTask;
    }

    return updatedCheckpoint;
  }

  async getTask(taskId: string, userId: string): Promise<any> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        checkpoints: { orderBy: { orderIndex: 'asc' } },
        dream: { select: { title: true, id: true } },
      },
    });

    if (!task || task.userId !== userId) {
      throw new NotFoundError('Task');
    }

    return task;
  }

  async listTasks(
    userId: string,
    dreamId?: string,
    status?: string
  ): Promise<any[]> {
    return prisma.task.findMany({
      where: {
        userId,
        ...(dreamId && { dreamId }),
        ...(status && { status: status as TaskStatus }),
      },
      orderBy: { deadline: 'asc' },
    });
  }
}

export const taskService = new TaskService();