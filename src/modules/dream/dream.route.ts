import { Router, Request, Response, NextFunction } from 'express';
import { dreamController } from './dream.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  dreamController.create(req, res).catch(next);
});

router.post('/:dreamId/validate', (req: Request, res: Response, next: NextFunction) => {
  dreamController.validate(req, res).catch(next);
});

router.post('/:dreamId/confirm', (req: Request, res: Response, next: NextFunction) => {
  dreamController.confirm(req, res).catch(next);
});

router.get('/:dreamId', (req: Request, res: Response, next: NextFunction) => {
  dreamController.get(req, res).catch(next);
});

router.put('/:dreamId', (req: Request, res: Response, next: NextFunction) => {
  dreamController.update(req, res).catch(next);
});

router.delete('/:dreamId', (req: Request, res: Response, next: NextFunction) => {
  dreamController.archive(req, res).catch(next);
});

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  dreamController.list(req, res).catch(next);
});

router.post('/:dreamId/complete', (req: Request, res: Response, next: NextFunction) => {
  dreamController.complete(req, res).catch(next);
});

router.post('/:dreamId/fail', (req: Request, res: Response, next: NextFunction) => {
  dreamController.fail(req, res).catch(next);
});

export default router;