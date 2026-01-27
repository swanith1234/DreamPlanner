import { Response } from 'express';
import { AuthRequest } from '../../types';
import { authService } from './auth.service';
import { logger } from '../../utils/logger';
import prisma from '../../config/database';

export class AuthController {
  async signup(req: AuthRequest, res: Response) {
    try {
      const result = await authService.signup(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      await logger.error('auth', error.message, { context: error.context });
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async login(req: AuthRequest, res: Response) {
    try {
      const result = await authService.login(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      await logger.error('auth', error.message);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async me(req: AuthRequest, res: Response) {
    try {
      const userId = req.userId!;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          preferences: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json({ user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const authController = new AuthController();