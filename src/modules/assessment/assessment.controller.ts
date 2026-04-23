import { Response } from 'express';
import { AuthRequest } from '../../types';
import { assessmentService } from './assessment.service';
import { logger } from '../../utils/logger';
import { RoadmapEntityType } from '@prisma/client';

export class AssessmentController {

  async completeMilestone(req: AuthRequest, res: Response) {
    try {
      const { milestoneId } = req.params;
      const assessment = await assessmentService.getOrCreateAssessment(req.userId!, milestoneId);
      res.status(201).json({ assessmentId: assessment.id, assessment });
    } catch (error: any) {
      await logger.error('assessment', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async get(req: AuthRequest, res: Response) {
    try {
      const { assessmentId } = req.params;
      const assessment = await assessmentService.getAssessment(req.userId!, assessmentId);
      res.status(200).json(assessment);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async attempt(req: AuthRequest, res: Response) {
    try {
      const { assessmentId } = req.params;
      const { answers } = req.body || {};
      const result = await assessmentService.submitAttempt(req.userId!, assessmentId, answers);
      res.status(200).json(result);
    } catch (error: any) {
      await logger.error('assessment', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async createRevision(req: AuthRequest, res: Response) {
    try {
      const { roadmapId, entityType, entityId, reason, dueDate } = req.body || {};
      if (!roadmapId || !entityType || !entityId || !reason) {
        res.status(400).json({ error: 'roadmapId, entityType, entityId, reason are required' });
        return;
      }
      const rev = await assessmentService.createRevision(
        req.userId!,
        roadmapId,
        entityType as RoadmapEntityType,
        entityId,
        reason,
        dueDate
      );
      res.status(201).json(rev);
    } catch (error: any) {
      await logger.error('assessment', error.message, {}, req.userId);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}

export const assessmentController = new AssessmentController();

