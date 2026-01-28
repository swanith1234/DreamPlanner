import { Router, Request, Response, NextFunction } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/signup', (req: Request, res: Response, next: NextFunction) => {
  authController.signup(req, res).catch(next);
});


router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  authController.login(req, res).catch(next);
});

router.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
  authController.refresh(req, res).catch(next);
});

router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  authController.logout(req, res).catch(next);
});

router.get('/me', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  authController.me(req, res).catch(next);
});

export default router;