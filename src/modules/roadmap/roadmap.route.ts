import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { roadmapController } from './roadmap.controller';

const router = Router();
router.use(authMiddleware);

router.post('/generate', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.generate(req, res).catch(next);
});

router.get('/dream/:dreamId/active', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.getActiveByDream(req, res).catch(next);
});

router.get('/dream/:dreamId/all', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.listByDream(req, res).catch(next);
});

router.get('/:roadmapId', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.getById(req, res).catch(next);
});

router.put('/:roadmapId', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.updateDraft(req, res).catch(next);
});

router.post('/:roadmapId/activate', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.activate(req, res).catch(next);
});

// Node-level updates
router.patch('/milestones/:milestoneId', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.updateMilestone(req, res).catch(next);
});

router.patch('/milestones/:milestoneId/status', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.updateMilestoneStatus(req, res).catch(next);
});

router.patch('/skills/:skillId', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.updateSkill(req, res).catch(next);
});

router.patch('/skills/:skillId/status', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.updateSkillStatus(req, res).catch(next);
});

router.post('/:roadmapId/milestones', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.addMilestone(req, res).catch(next);
});

router.delete('/milestones/:milestoneId', (req: Request, res: Response, next: NextFunction) => {
  roadmapController.deleteMilestone(req, res).catch(next);
});

export default router;

