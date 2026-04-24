import { Router } from 'express';
import { submitFeedback } from './feedback.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// Endpoint: POST /api/feedback
router.post('/', authMiddleware as any, submitFeedback);

export default router;
