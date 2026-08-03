// src/modules/notification/notification.action.handler.ts
//
// Handles progress-button taps and inline replies fired from the Android
// notification shade. Called by NotificationActionReceiver (a BroadcastReceiver),
// which has no cookie jar — so identity comes from a signed action token minted
// at dispatch time, NOT from anything in the request body.
//
// Design rules this file enforces:
//   • Never trust a body-supplied userId          (Part 14)
//   • Verify the full ownership chain before writing (Part 14)
//   • Route mutations through the SAME domain service the chat agent uses (Part 15)
//   • Make retries safe via an idempotency key    (Part 16)
//   • No LLM involvement on the PROGRESS path     (Part 18)

import { Request, Response } from 'express';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { chatService } from '../chat/chat.service';
import { taskService } from '../task/task.service';
import { verifyActionToken } from './notificationAction.token';

interface ActionOutcome {
    ok: boolean;
    /** Progress of the affected checkpoint (or task) after the mutation. */
    progress?: number;
    reason?: string;
}

export async function notificationActionHandler(req: Request, res: Response) {
    const { notificationId, type, value, text, actionToken, idempotencyKey } = req.body ?? {};

    // ── 1. Authenticate via the signed token ────────────────────────────────
    // The old contract read `userId` straight from the body, which let anyone
    // complete another user's tasks or write into their chat history.
    const claims = verifyActionToken(actionToken);
    if (!claims) {
        res.status(401).json({ success: false, error: 'Invalid or expired action token' });
        return;
    }

    if (!notificationId || !type) {
        res.status(400).json({ success: false, error: 'notificationId and type are required' });
        return;
    }

    // The token is scoped to exactly one notification.
    if (claims.notificationId !== notificationId) {
        await logger.warn('notification', 'notificationAction: token/notification mismatch', {
            tokenNotificationId: claims.notificationId,
            requestedNotificationId: notificationId,
        });
        res.status(403).json({ success: false, error: 'Token does not authorise this notification' });
        return;
    }

    const userId = claims.userId;

    try {
        // ── 2. Load the notification and verify ownership ───────────────────
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
            select: { id: true, userId: true, taskId: true, checkpointId: true },
        });

        if (!notification) {
            // Stale notification: the row was deleted after the push was sent.
            res.status(404).json({ success: false, error: 'This reminder is no longer available' });
            return;
        }

        if (notification.userId !== userId) {
            await logger.warn('notification', 'notificationAction: ownership mismatch', {
                notificationId,
                userId,
            });
            res.status(403).json({ success: false, error: 'Not authorised' });
            return;
        }

        // ── 3. Idempotency ──────────────────────────────────────────────────
        // Android may replay a PendingIntent, and the receiver has no retry
        // visibility. Replaying the same key returns the original outcome instead
        // of applying the delta twice.
        if (idempotencyKey) {
            const prior = await prisma.notificationAction.findUnique({
                where: { idempotencyKey: String(idempotencyKey) },
            });
            if (prior) {
                await logger.info('notification', 'notificationAction: replayed key, returning prior result', {
                    idempotencyKey,
                    notificationId,
                });
                res.json({ success: true, replayed: true, progress: prior.resultProgress ?? undefined });
                return;
            }
        }

        const outcome =
            type === 'PROGRESS'
                ? await applyProgress(userId, notification, value)
                : type === 'REPLY'
                    ? await applyReply(userId, notificationId, text)
                    : { ok: false, reason: `Unsupported action type: ${type}` };

        if (!outcome.ok) {
            res.status(400).json({ success: false, error: outcome.reason });
            return;
        }

        // ── 4. Record the action so a replay is detectable ──────────────────
        if (idempotencyKey) {
            await prisma.notificationAction.create({
                data: {
                    idempotencyKey: String(idempotencyKey),
                    notificationId,
                    userId,
                    actionType: String(type),
                    value: type === 'PROGRESS' ? toDelta(value) : null,
                    resultProgress: outcome.progress ?? null,
                },
            }).catch(async (err: any) => {
                // A concurrent duplicate lost the unique-constraint race. The
                // mutation already happened once; nothing further to do.
                if (err?.code !== 'P2002') throw err;
                await logger.info('notification', 'notificationAction: concurrent duplicate key', { idempotencyKey });
            });
        }

        res.json({ success: true, progress: outcome.progress });
    } catch (err: any) {
        await logger.error('notification', 'notificationAction handler error', {
            error: err.message,
            notificationId,
        });
        res.status(500).json({ success: false, error: 'Could not apply the update' });
    }
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────

/** Coerce the button's value into a 0–100 delta. Returns NaN when unusable. */
function toDelta(value: unknown): number {
    const n = parseInt(String(value), 10);
    if (isNaN(n) || n < 0 || n > 100) return NaN;
    return n;
}

/**
 * Apply a progress delta from a notification button.
 *
 * Targets the notification's bound checkpoint when present, otherwise the task's
 * active (first incomplete) checkpoint — the same target the chat agent and web
 * UI mutate, so all three stay consistent.
 *
 * Delegates to taskService.updateCheckpointProgress(), which owns the single
 * implementation of "checkpoint progress → recalculated task progress". The
 * previous version wrote `task.progressPercent` directly, which skipped that
 * recalculation and was silently overwritten by the next checkpoint update.
 */
async function applyProgress(
    userId: string,
    notification: { id: string; taskId: string | null; checkpointId: string | null },
    value: unknown,
): Promise<ActionOutcome> {
    const delta = toDelta(value);
    if (isNaN(delta)) {
        return { ok: false, reason: 'Invalid progress value' };
    }

    if (!notification.taskId) {
        return { ok: false, reason: 'This reminder is not linked to a task' };
    }

    // Ownership of the task (and therefore its checkpoints) is enforced inside
    // taskService — every method re-checks `task.userId !== userId`.
    let targetCheckpointId = notification.checkpointId;

    if (!targetCheckpointId) {
        const active = await taskService.getActiveCheckpointForTask(notification.taskId, userId);
        targetCheckpointId = active?.id ?? null;
    }

    // Task has no checkpoints at all → fall back to task-level progress so the
    // button still does something sensible.
    if (!targetCheckpointId) {
        const task = await taskService.getTask(notification.taskId, userId);
        const next = Math.min(100, (task.progressPercent ?? 0) + delta);
        await taskService.updateProgress(notification.taskId, userId, next);
        return { ok: true, progress: next };
    }

    try {
        const updated = await taskService.updateCheckpointProgress(
            notification.taskId,
            targetCheckpointId,
            userId,
            delta,
        );
        const cp = (updated.checkpoints ?? []).find((c: any) => c.id === targetCheckpointId);
        return { ok: true, progress: cp?.progress };
    } catch (err: any) {
        // Most likely cause: the bound checkpoint was completed since the push was
        // sent, so it is no longer the active one. Retry against whatever is
        // active now rather than failing the user's tap.
        const active = await taskService.getActiveCheckpointForTask(notification.taskId, userId);
        if (!active) {
            return { ok: false, reason: 'All checkpoints for this task are already complete' };
        }
        if (active.id === targetCheckpointId) {
            return { ok: false, reason: err.message ?? 'Could not update progress' };
        }

        const updated = await taskService.updateCheckpointProgress(
            notification.taskId,
            active.id,
            userId,
            delta,
        );
        const cp = (updated.checkpoints ?? []).find((c: any) => c.id === active.id);
        return { ok: true, progress: cp?.progress };
    }
}

// ─── REPLY ───────────────────────────────────────────────────────────────────

/**
 * Persist an inline reply typed into the notification shade.
 *
 * Stored as a user message so the chat surface reflects it. We intentionally do
 * NOT run the AI orchestrator here: it needs an accessToken to call the internal
 * REST adapters, and minting a full session credential from a notification token
 * would widen that token's scope well beyond one reminder.
 */
async function applyReply(
    userId: string,
    notificationId: string,
    text: unknown,
): Promise<ActionOutcome> {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
        return { ok: false, reason: 'Empty reply' };
    }

    await chatService.saveMessage(userId, 'user', trimmed, null, null, {
        notificationId,
        actionType: 'INLINE_REPLY',
        source: 'notification_remote_input',
    });

    await logger.info('notification', '[Action] Inline reply received via notification', {
        notificationId,
        textLength: trimmed.length,
    }, userId);

    return { ok: true };
}
