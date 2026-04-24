import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { generateCurl } from '../utils/curlGenerator';
import prisma from '../config/database';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODE_MIND_WEBHOOK_URL =
  process.env.CODE_MIND_WEBHOOK_URL ?? 'http://localhost:4000/webhook/crash';

// ─── Stack Trace Parser ───────────────────────────────────────────────────────

interface StackFrame {
  functionName: string;
  filePath: string;
}

/**
 * Extracts the first meaningful application frame from a Node.js stack trace.
 *
 * Strategy:
 *  1. Skip node_modules and Node.js internals (<anonymous>, node:*).
 *  2. Return the first frame that looks like application code.
 *  3. Fall back to the raw first line if nothing matches.
 */
function parseStackTrace(stack: string): StackFrame {
  const lines = stack.split('\n').slice(1); // drop the "Error: message" header

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip internals
    if (trimmed.includes('node_modules')) continue;
    if (trimmed.includes('node:internal')) continue;
    if (trimmed.startsWith('at Generator') || trimmed.startsWith('at Object.<anonymous>')) continue;

    // "at functionName (/abs/path.ts:line:col)"
    const namedMatch = trimmed.match(/^at\s+([\w$.]+(?:\.<\w+>)?(?:\.\w+)*)\s+\((.+?):\d+:\d+\)$/);
    if (namedMatch) {
      return { functionName: namedMatch[1], filePath: namedMatch[2] };
    }

    // "at /abs/path.ts:line:col"  (anonymous / arrow)
    const anonMatch = trimmed.match(/^at\s+(.+?):\d+:\d+$/);
    if (anonMatch) {
      return { functionName: '<anonymous>', filePath: anonMatch[1] };
    }
  }

  return { functionName: '<unknown>', filePath: '<unknown>' };
}

import { sendApprovalRequest } from '../lib/telegram';

// ─── Async Dispatch (fire-and-forget) ────────────────────────────────────────

/**
 * Persists the crash to the AppLog and Feedback table, and dispatches a
 * Telegram approval request to the admin — completely async; never blocks.
 */
async function reportCrashForApproval(payload: {
  traceId: string;
  functionName: string;
  filePath: string;
  errorMessage: string;
  stackTrace: string;
  curlCommand: string;
  userId?: string;
}): Promise<void> {
  const { traceId, functionName, filePath, errorMessage, stackTrace, curlCommand, userId } = payload;

  try {
    // ── 1. Persist to AppLog ──────────────────────────────────────────────
    await prisma.appLog.create({
      data: {
        level: 'ERROR',
        source: 'globalErrorHandler',
        message: errorMessage,
        context: {
          traceId,
          functionName,
          filePath,
          stackTrace,
          curlCommand,
        },
        userId: userId ?? null,
      },
    });

    // ── 2. Create PENDING Feedback ────────────────────────────────────────
    const feedback = await prisma.feedback.create({
      data: {
        type: 'BUG',
        message: `Unhandled Backend Exception: ${errorMessage.split('\n')[0]}`,
        status: 'PENDING',
        traceId: traceId
      }
    });

    // ── 3. Send Telegram Approval Request ─────────────────────────────────
    const combinedMessage = `[UNHANDLED BACKEND CRASH]\n\n[ERROR]\n${errorMessage}\n\n[FILE]\n${filePath}\n\n[FUNCTION]\n${functionName}`;
    await sendApprovalRequest(feedback, combinedMessage);

    console.log(`[Sentinel] Crash reported to Telegram for approval (traceId: ${traceId})`);
  } catch (err) {
    console.error('[Sentinel] Failed to report crash for approval:', err);
  }
}

// ─── Global Error Handler Middleware ─────────────────────────────────────────

/**
 * Drop-in replacement for IgniteMate's existing `errorHandler` middleware.
 *
 * Behaviour:
 *  - AppErrors (operational): respond immediately with the correct status + message.
 *  - Unexpected errors (500):
 *      1. Respond to the client immediately (non-blocking).
 *      2. Fire the async Code-Mind dispatch pipeline in the background.
 *
 * Mount this LAST in app.ts, replacing the existing `app.use(errorHandler)`.
 */
export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // ── Operational errors — fast path, no agent needed ──────────────────
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.context && { context: error.context }),
    });
    return;
  }

  // ── Unexpected 500 error — respond immediately, then dispatch agent ──
  const traceId = randomUUID();
  const { functionName, filePath } = parseStackTrace(error.stack ?? '');
  const curlCommand = generateCurl(req);

  // Respond first, always < 1ms
  res.status(500).json({
    error: 'Internal server error',
    traceId,                           // Surface the trace ID for support
  });

  // Log to console synchronously (cheap)
  console.error(
    `[Sentinel] Unhandled error | traceId: ${traceId} | fn: ${functionName} | ${error.message}`
  );

  // Everything else is fire-and-forget — guaranteed not to block the response
  reportCrashForApproval({
    traceId,
    functionName,
    filePath,
    errorMessage: error.message + '\n\n' + (error.stack ?? ''),
    stackTrace: error.stack ?? '',
    curlCommand,
    userId: (req as any).user?.id,   // populated by auth middleware if available
  }).catch((unexpected) => {
    console.error('[Sentinel] Unexpected error in reportCrashForApproval:', unexpected);
  });
};
