import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.utils';
import { AuthRequest } from '../types';
import { logger } from '../utils/logger';

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    const decoded = verifyAccessToken(token);

    req.userId = decoded.userId;
    req.email = decoded.email;

    next();
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid token' });
  }
};