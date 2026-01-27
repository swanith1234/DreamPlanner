import prisma from '../config/database';
import { LogLevel } from '@prisma/client';

export class Logger {
  private logLevel: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private getCurrentLevel(): number {
    const level = process.env.LOG_LEVEL || 'info';
    return this.logLevel[level] || 1;
  }

  async log(
    level: LogLevel,
    source: string,
    message: string,
    context?: any,
    userId?: string
  ) {
    const numericLevel = this.logLevel[level.toLowerCase()] || 1;
    if (numericLevel < this.getCurrentLevel()) return;

    console.log(`[${level}] [${source}] ${message}`, context || '');

    // Store in DB for analytics
    try {
      await prisma.appLog.create({
        data: {
          level,
          source,
          message,
          context: context ? JSON.parse(JSON.stringify(context)) : null,
          userId,
        },
      });
    } catch (err) {
      console.error('Failed to log to DB:', err);
    }
  }

  async info(source: string, message: string, context?: any, userId?: string) {
    await this.log('INFO', source, message, context, userId);
  }

  async warn(source: string, message: string, context?: any, userId?: string) {
    await this.log('WARN', source, message, context, userId);
  }

  async error(source: string, message: string, context?: any, userId?: string) {
    await this.log('ERROR', source, message, context, userId);
  }
}

export const logger = new Logger();