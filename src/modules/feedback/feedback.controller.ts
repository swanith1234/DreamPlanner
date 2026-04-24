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

    // ── Telegram Approval Trigger ───────────────────────────────────────────
    if (type === 'BUG' && traceId) {
      // Fire-and-forget async trigger so we don't block the user's response
      (async () => {
        try {
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
            
            // Fuse the human complaint with the raw technical stack trace
            const combinedMessage = `[HUMAN FEEDBACK]\n${message}\n\n[TECHNICAL ERROR]\n${ctx.stackTrace || appLog.message}`;

            await sendApprovalRequest(feedback, combinedMessage);
          } else {
             console.log(`[Feedback Controller] Could not find AppLog context for traceId: ${traceId}`);
          }
        } catch (err: any) {
          console.error('[Feedback Controller] Failed to trigger Telegram bot:', err?.message || err);
        }
      })();
    }

    res.status(201).json({ success: true, feedback });
  } catch (error) {
    next(error);
  }
};
