import { Response } from 'express';
import { AuthRequest } from '../../types';
import { roadmapService } from './roadmap.service';
import { logger } from '../../utils/logger';

export class RoadmapController {
  async generate(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.body || {};
      if (!dreamId || typeof dreamId !== 'string') {
        res.status(400).json({ error: 'dreamId is required' });
        return;
      }
      const roadmap = await roadmapService.generate(req.userId!, dreamId);
      res.status(201).json(roadmap);
    } catch (error: any) {
      await logger.error('roadmap', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getActiveByDream(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const roadmap = await roadmapService.getActiveByDream(req.userId!, dreamId);
      res.status(200).json({ roadmap });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async listByDream(req: AuthRequest, res: Response) {
    try {
      const { dreamId } = req.params;
      const roadmaps = await roadmapService.getByDream(req.userId!, dreamId);
      res.status(200).json({ roadmaps });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const { roadmapId } = req.params;
      const roadmap = await roadmapService.getById(req.userId!, roadmapId);
      res.status(200).json(roadmap);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateDraft(req: AuthRequest, res: Response) {
    try {
      const { roadmapId } = req.params;
      const { draft } = req.body || {};
      if (!draft || typeof draft !== 'object') {
        res.status(400).json({ error: 'draft is required' });
        return;
      }
      const updated = await roadmapService.updateDraft(req.userId!, roadmapId, draft);
      res.status(200).json(updated);
    } catch (error: any) {
      await logger.error('roadmap', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async activate(req: AuthRequest, res: Response) {
    try {
      const { roadmapId } = req.params;
      const activated = await roadmapService.activate(req.userId!, roadmapId);
      res.status(200).json(activated);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateMilestone(req: AuthRequest, res: Response) {
    try {
      const { milestoneId } = req.params;
      const updated = await roadmapService.updateMilestone(req.userId!, milestoneId, req.body);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateMilestoneStatus(req: AuthRequest, res: Response) {
    try {
      const { milestoneId } = req.params;
      const { status } = req.body;
      const updated = await roadmapService.updateMilestoneStatus(req.userId!, milestoneId, status);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateSkill(req: AuthRequest, res: Response) {
    try {
      const { skillId } = req.params;
      const updated = await roadmapService.updateSkill(req.userId!, skillId, req.body);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateSkillStatus(req: AuthRequest, res: Response) {
    try {
      const { skillId } = req.params;
      const { status } = req.body;
      const updated = await roadmapService.updateSkillStatus(req.userId!, skillId, status);
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}

export const roadmapController = new RoadmapController();

