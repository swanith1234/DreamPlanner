import { Router } from 'express';
import { userController } from './user.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.put('/preferences', authMiddleware, userController.updatePreferences);
router.get('/preferences', authMiddleware, userController.getPreferences);

export default router;
