// src/modules/task/task.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { taskService } from './task.service';
import { logger } from '../../utils/logger';
import { globalCache, MemoryCache } from '../../utils/cache';

export class TaskController {
  private invalidateCache(userId: string, taskId?: string) {
    // Clear all variations of task lists and searches for this user
    globalCache.deleteByPrefix(MemoryCache.generateKey('tasks_list', userId));
    globalCache.deleteByPrefix(MemoryCache.generateKey('tasks_search', userId));
    
    // Also clear dashboard cache
    globalCache.delete(MemoryCache.generateKey('dashboard', userId));
    
    if (taskId) {
      globalCache.delete(MemoryCache.generateKey('task_detail', userId, { taskId }));
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const task = await taskService.createTask(req.userId!, req.body);
      this.invalidateCache(req.userId!);
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
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateProgress(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const { value } = req.body;

      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error('Invalid progress value');
      }

      const task = await taskService.updateProgress(taskId, req.userId!, value);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async complete(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.completeTask(taskId, req.userId!);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async block(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.blockTask(taskId, req.userId!);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async archive(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const task = await taskService.archiveTask(taskId, req.userId!);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      await taskService.deleteTask(taskId, req.userId!);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json({ success: true });
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
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateCheckpointProgress(req: AuthRequest, res: Response) {
    try {
      const { taskId, checkpointId } = req.params;
      const { delta, localDate } = req.body;

      if (typeof delta !== 'number' || delta <= 0 || delta > 100) {
        res.status(400).json({ error: 'Invalid delta' });
        return;
      }

      const result = await taskService.updateCheckpointProgress(
        taskId,
        checkpointId,
        req.userId!,
        delta,
        localDate
      );
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async deleteCheckpoint(req: AuthRequest, res: Response) {
    try {
      const { taskId, checkpointId } = req.params;
      const result = await taskService.deleteCheckpoint(taskId, checkpointId, req.userId!);
      this.invalidateCache(req.userId!, taskId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async get(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const { taskId } = req.params;

      const cacheKey = MemoryCache.generateKey('task_detail', userId, { taskId });
      const cachedData = globalCache.get(cacheKey);
      if (cachedData) {
        res.status(200).json(cachedData);
        return;
      }

      const task = await taskService.getTask(taskId, userId);
      globalCache.set(cacheKey, task);
      res.status(200).json(task);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const { dreamId, status } = req.query;

      const cacheParams: any = {};
      if (dreamId) cacheParams.dreamId = dreamId;
      if (status) cacheParams.status = status;
      
      const cacheKey = MemoryCache.generateKey('tasks_list', userId, cacheParams);
      const cachedData = globalCache.get(cacheKey);
      if (cachedData) {
        res.status(200).json(cachedData);
        return;
      }

      const tasks = await taskService.listTasks(
        userId,
        dreamId as string | undefined,
        status as string | undefined
      );
      
      const response = { tasks };
      globalCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async search(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const { q, status, dreamId } = req.query;

      const cacheKey = MemoryCache.generateKey('tasks_search', userId, { q, status, dreamId });
      const cachedData = globalCache.get(cacheKey);
      if (cachedData) return res.status(200).json(cachedData);

      const tasks = await taskService.searchTasks(
        userId,
        {
          q: q as string | undefined,
          status: status as string | undefined,
          dreamId: dreamId as string | undefined,
        }
      );
      
      const response = { tasks };
      globalCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const taskController = new TaskController();