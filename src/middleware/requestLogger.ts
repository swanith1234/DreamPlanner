import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  res.on('finish', async () => {
    const duration = Date.now() - start;
    const userId = (req as any).userId;

    if (res.statusCode >= 400) {
      await logger.warn(
        'http',
        `${req.method} ${req.path}`,
        {
          statusCode: res.statusCode,
          duration,
        },
        userId
      );
    } else {
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    }
  });

  next();
};
