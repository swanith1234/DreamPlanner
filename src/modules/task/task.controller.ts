// src/modules/task/task.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { taskService } from './task.service';
import { logger } from '../../utils/logger';

export class TaskController {
  async create(req: AuthRequest, res: Response) {
    try {
      const task = await taskService.createTask(req.userId!, req.body);
      res.status(201).json(task);
    } catch (error: any) {
      await logger.error('task', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.updateTask(taskId, req.userId!, req.body);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateProgress(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const { value } = req.body; // { value: number }

      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error('Invalid progress value');
      }

      const task = await taskService.updateProgress(taskId, req.userId!, value);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async complete(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.completeTask(taskId, req.userId!);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async block(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.blockTask(taskId, req.userId!);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async archive(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.archiveTask(taskId, req.userId!);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateCheckpoint(req: AuthRequest, res: Response) {
    try {
      const { taskId, checkpointId } = req.params;
      const result = await taskService.updateCheckpoint(
        taskId,
        checkpointId,
        req.userId!,
        req.body
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async toggleCheckpoint(req: AuthRequest, res: Response) {
    try {
      const { taskId, checkpointId } = req.params;
      const { isCompleted } = req.body;
      const result = await taskService.toggleCheckpoint(
        taskId,
        checkpointId,
        req.userId!,
        isCompleted
      );
      res.status(200).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async get(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.getTask(taskId, req.userId!);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async list(req: AuthRequest, res: Response) {
    try {
      const { dreamId, status } = req.query;
      const tasks = await taskService.listTasks(
        req.userId!,
        dreamId as string | undefined,
        status as string | undefined
      );
      res.status(200).json({ tasks });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const taskController = new TaskController();