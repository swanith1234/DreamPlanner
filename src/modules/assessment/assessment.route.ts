import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { assessmentController } from './assessment.controller';

const router = Router();
router.use(authMiddleware);

// Completion triggers (create assessment)

router.post('/milestones/:milestoneId/complete', (req: Request, res: Response, next: NextFunction) => {
  assessmentController.completeMilestone(req, res).catch(next);
});

// Assessment lifecycle
router.get('/:assessmentId', (req: Request, res: Response, next: NextFunction) => {
  assessmentController.get(req, res).catch(next);
});

router.post('/:assessmentId/attempt', (req: Request, res: Response, next: NextFunction) => {
  assessmentController.attempt(req, res).catch(next);
});

// Revisions
router.post('/revisions', (req: Request, res: Response, next: NextFunction) => {
  assessmentController.createRevision(req, res).catch(next);
});

export default router;

