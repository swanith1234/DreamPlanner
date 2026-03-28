import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { forecastController } from './forecast.controller';

const router = Router();
router.use(authMiddleware);

router.post('/run', (req: Request, res: Response, next: NextFunction) => {
  forecastController.run(req, res).catch(next);
});

router.get('/dream/:dreamId', (req: Request, res: Response, next: NextFunction) => {
  forecastController.list(req, res).catch(next);
});

export default router;

