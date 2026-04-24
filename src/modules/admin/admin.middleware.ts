import { Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { AuthRequest } from '../../types';

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      res.status(403).json({ error: 'Admin access not configured on server' });
      return;
    }

    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true }
    });

    if (!user || user.email !== adminEmail) {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
};
