import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../modules/auth/auth.utils';
import { AuthRequest } from '../types';
import { logger } from '../utils/logger';

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    req.userId = decoded.userId;
    req.email = decoded.email;

    next();
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid token' });
  }
};