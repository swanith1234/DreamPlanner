// src/modules/chat/chat.route.ts

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { chatController } from './chat.controller';

const router = Router();
router.use(authMiddleware);

router.post('/', (req: Request, res: Response, next: NextFunction) => {
    chatController.sendMessage(req as any, res).catch(next);
});

router.get('/history', (req: Request, res: Response, next: NextFunction) => {
    chatController.getHistory(req as any, res).catch(next);
});

router.patch('/seen', (req: Request, res: Response, next: NextFunction) => {
    chatController.markAsSeen(req as any, res).catch(next);
});

export default router;
