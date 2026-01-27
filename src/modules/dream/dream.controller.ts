// src/modules/dream/dream.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { dreamService } from './dream.service';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

export class DreamController {
  async create(req: AuthRequest, res: Response) {
    try {
      const dream = await dreamService.createDraft(req.userId!, req.body);
      res.status(201).json(dream);
    } catch (error: any) {
      await logger.error('dream', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.updateDream(dreamId, req.userId!, req.body);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async archive(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.archiveDream(dreamId, req.userId!);
      res.status(200).json(dream);
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
      const { status } = req.query;
      const dreams = await dreamService.listDreams(
        req.userId!,
        status as string | undefined
      );
      res.status(200).json({ dreams });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async complete(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.completeDream(dreamId, req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async fail(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const dream = await dreamService.failDream(dreamId, req.userId!);
      res.status(200).json(dream);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}

export const dreamController = new DreamController();