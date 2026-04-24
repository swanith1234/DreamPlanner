import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { FeedbackType } from '@prisma/client';
import { AuthRequest } from '../../types';
import { sendApprovalRequest } from '../../lib/telegram';

export const submitFeedback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { type, message, traceId, path } = req.body;
    
    // Auth middleware attaches the userId directly to req
    const userId = (req as AuthRequest).userId;

    if (!type || !message) {
      res.status(400).json({ error: 'Feedback type and message are required.' });
      return;
    }

    if (!['BUG', 'IDEA'].includes(type)) {
      res.status(400).json({ error: 'Invalid feedback type.' });
      return;
    }

    const feedback = await prisma.feedback.create({
      data: {
        type: type as FeedbackType,
        message,
        traceId: traceId || null,
        path: path || null,
        userId: userId || null,
      },
    });

    // ── Telegram Notification ──────────────────────────────────────────────
    // Fire-and-forget async trigger
    (async () => {
      try {
        console.log(`[Feedback Controller] Attempting Telegram notify for feedback ${feedback.id} (type: ${type})`);
        
        let combinedMessage = `[HUMAN FEEDBACK]\n${message}`;

        if (traceId) {
          // Look up the corresponding crash details from AppLog
          const appLog = await prisma.appLog.findFirst({
            where: {
              source: 'globalErrorHandler',
              context: {
                path: ['traceId'],
                equals: traceId
              }
            }
          });

          if (appLog && appLog.context) {
            const ctx = appLog.context as any;
            // Cleaned up message: only include the error message, NOT the whole stack trace
            combinedMessage += `\n\n[TECHNICAL ERROR]\n${appLog.message.split('\n')[0]}`;
          } else {
            console.warn(`[Feedback Controller] No AppLog found for traceId: ${traceId}`);
          }
        }

        await sendApprovalRequest(feedback, combinedMessage);
        console.log(`[Feedback Controller] Telegram notify success for feedback ${feedback.id}`);
      } catch (err: any) {
        console.error('[Feedback Controller] Failed to trigger Telegram bot:', err?.message || err);
      }
    })();

    res.status(201).json({ success: true, feedback });
  } catch (error) {
    next(error);
  }
};
