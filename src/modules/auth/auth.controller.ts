import { Response } from 'express';
import { AuthRequest } from '../../types';
import { authService } from './auth.service';
import { logger } from '../../utils/logger';
import prisma from '../../config/database';

export class AuthController {
  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true, // Required for SameSite: None
      sameSite: 'none', // Required for cross-site (Vercel -> Render)
      maxAge: 15 * 60 * 1000 // 15m
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7d
    });
  }

  async signup(req: AuthRequest, res: Response) {
    try {
      const userAgent = req.headers['user-agent'];
      const result = await authService.signup({ ...req.body, userAgent });

      this.setCookies(res, result.accessToken, result.refreshToken);

      res.status(201).json({ user: result.user });
    } catch (error: any) {
      await logger.error('auth', error.message, { context: error.context });
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async login(req: AuthRequest, res: Response) {
    try {
      const userAgent = req.headers['user-agent'];
      const result = await authService.login({ ...req.body, userAgent });

      this.setCookies(res, result.accessToken, result.refreshToken);

      res.status(200).json({ user: result.user });
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

  async refresh(req: AuthRequest, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      const userAgent = req.headers['user-agent'];

      if (!refreshToken) throw new Error('Refresh token required');

      const result = await authService.refreshToken({
        refreshToken,
        userAgent
      });

      this.setCookies(res, result.accessToken, result.refreshToken);

      res.status(200).json({ success: true });
    } catch (error: any) {
      // Clear cookies if refresh fails
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      res.status(401).json({ error: error.message });
    }
  }

  async logout(req: AuthRequest, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const authController = new AuthController();