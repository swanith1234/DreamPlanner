import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.context && { context: error.context }),
    });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
};