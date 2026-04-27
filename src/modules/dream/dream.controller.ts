// src/modules/dream/dream.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { dreamService } from './dream.service';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { globalCache, MemoryCache } from '../../utils/cache';

export class DreamController {
  private invalidateCache(userId: string) {
    globalCache.deleteByPrefix(MemoryCache.generateKey('dreams_list', userId));
    globalCache.deleteByPrefix(MemoryCache.generateKey('dreams_search', userId));
    // Clear dashboard as dream status affects stats
    globalCache.delete(MemoryCache.generateKey('dashboard', userId));
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const dream = await dreamService.createDraft(req.userId!, req.body);
      this.invalidateCache(req.userId!);
      res.status(201).json(dream);
    } catch (error: any) {
      await logger.error('dream', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async sync(req: AuthRequest, res: Response) {
    try {
      const result = await dreamService.syncDreamState(req.userId!, req.body);
      res.status(200).json(result);
    } catch (error: any) {
      await logger.error('dream', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.updateDream(dreamId, req.userId!, req.body);
      this.invalidateCache(req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async archive(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.archiveDream(dreamId, req.userId!);
      this.invalidateCache(req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      await dreamService.deleteDream(dreamId, req.userId!);
      this.invalidateCache(req.userId!);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async validate(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const result = await dreamService.validateDream(dreamId, req.userId!);
      res.status(200).json(result);
    } catch (error: any) {
      await logger.error('dream', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async confirm(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.confirmDream(
        dreamId,
        req.userId!,
        req.body
      );
      this.invalidateCache(req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      await logger.error('dream', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async get(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.getDream(dreamId, req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const { status } = req.query;
      
      // Use a consistent key structure: dreams_list:userId[:status]
      const cacheParams = status ? { status } : {};
      const cacheKey = MemoryCache.generateKey('dreams_list', userId, cacheParams);
      const cachedData = globalCache.get(cacheKey);
      
      if (cachedData) {
        res.status(200).json(cachedData);
        return;
      }

      const dreams = await dreamService.listDreams(
        userId,
        status as string | undefined
      );
      
      const response = { dreams };
      globalCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async complete(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.completeDream(dreamId, req.userId!);
      this.invalidateCache(req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async fail(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.failDream(dreamId, req.userId!);
      this.invalidateCache(req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async search(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const { keyword, status } = req.query;

      const cacheParams: any = { keyword };
      if (status) cacheParams.status = status;
      const cacheKey = MemoryCache.generateKey('dreams_search', userId, cacheParams);
      const cachedData = globalCache.get(cacheKey);

      if (cachedData) {
        res.status(200).json(cachedData);
        return;
      }

      const dreams = await dreamService.searchDreams(
        userId,
        keyword as string | undefined,
        status as string | undefined
      );
      
      const response = { dreams };
      globalCache.set(cacheKey, response);
      res.status(200).json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const dreamController = new DreamController();