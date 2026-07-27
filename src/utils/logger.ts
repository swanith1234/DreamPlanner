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

    // Always log to console first — this never fails.
    console.log(`[${level}] [${source}] ${message}`, context || '');

    // Attempt to persist to DB. If DB is unavailable (e.g. OpenSSL TLS error
    // during startup), we silently fall back to console-only.
    // IMPORTANT: Never re-throw inside here — doing so caused an infinite
    // error cascade where a failed startup DB check triggered logger.error()
    // which triggered prisma.appLog.create() which failed again.
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
    } catch {
      // DB unavailable — console already has the log, nothing else to do.
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