
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { taskValidator } from './task.validator';
import { CreateTaskRequest, UpdateTaskRequest } from './task.dto';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { TaskStatus } from '@prisma/client';
import { eventService } from '../event/event.service';
import { notificationService } from '../notification/notification.service';

export class TaskService {
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
          create: input.checkpoints?.map((cp) => ({
            title: cp.title,
            targetDate: new Date(cp.targetDate),
            orderIndex: cp.orderIndex,
          })),
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
    if (data.targetDate) updateData.targetDate = new Date(data.targetDate);
    updateData.isUserEdited = true;

    return prisma.taskCheckpoint.update({
      where: { id: checkpointId },
      data: updateData,
    });
  }

  async toggleCheckpoint(
    taskId: string,
    checkpointId: string,
    userId: string,
    isCompleted: boolean
  ): Promise<any> {
    const task = await this.getTask(taskId, userId); // Verifies ownership

    // 1. Update the triggered checkpoint
    await prisma.taskCheckpoint.update({
      where: { id: checkpointId },
      data: { isCompleted },
    });

    // 2. Fetch all checkpoints to calculate new progress
    const updatedTask = await this.getTask(taskId, userId);
    const totalCheckpoints = updatedTask.checkpoints.length;

    if (totalCheckpoints > 0) {
      const completedCount = updatedTask.checkpoints.filter((cp: any) => cp.isCompleted).length;
      const newProgress = Math.round((completedCount / totalCheckpoints) * 100);

      // 3. Update task progress
      // Reuse updateProgress to handle event logging and timestamp updates
      await this.updateProgress(taskId, userId, newProgress);

      return updatedTask; // Return the Task (with new progress), or the Checkpoint? 
      // Plan didn't specify return type change, but calling updateProgress probably returns task.
      // Let's return the checkpoint to match original signature type or return updated task data?
      // Original returned checkpoint update result.
      // Frontend expects checkpoint update result mostly, but if we change it here...
      // Let's stick to returning the updated checkpoint but we want to ensure sidebar/UI updates.
      // Actually, since we updated the task, we might want to trigger a refresh. 
      // But for this function, let's just do the work.
    }

    return prisma.taskCheckpoint.findUnique({ where: { id: checkpointId } });
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