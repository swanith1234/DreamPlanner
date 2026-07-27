// src/modules/notification/notification.action.handler.ts
//
// Handles progress/reply actions fired from Android notification buttons
// and RemoteInput (inline reply). This endpoint is called directly by the
// native Android BroadcastReceiver — no browser/cookie context is available.

import { Request, Response } from 'express';
import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { chatService } from '../chat/chat.service';

export async function notificationActionHandler(req: Request, res: Response) {
    // Respond quickly so Android can dismiss the notification promptly
    res.json({ success: true });

    const { notificationId, userId, type, value, text } = req.body;

    if (!notificationId || !userId || !type) {
        // Already responded — just log and bail
        await logger.warn('notification', 'notificationAction: missing required fields', req.body);
        return;
    }

    try {
        if (type === 'PROGRESS') {
            // ── Parse the progress increment ──────────────────────────────────
            const increment = parseInt(String(value), 10);
            if (isNaN(increment) || increment < 0 || increment > 100) {
                await logger.warn('notification', 'notificationAction: invalid progress value', { value });
                return;
            }

            // Fetch the notification to get the linked task
            const notification = await prisma.notification.findUnique({
                where: { id: notificationId },
                include: { task: true },
            });

            if (!notification?.taskId) {
                await logger.warn('notification', 'notificationAction: no task linked to notification', { notificationId });
                return;
            }

            const taskId = notification.taskId;
            const currentTask = await prisma.task.findUnique({ where: { id: taskId } });
            if (!currentTask) return;

            // Clamp the new progress to 0–100
            const currentProgress = currentTask.progressPercent ?? 0;
            const newProgress = Math.min(100, currentProgress + increment);

            const isCompleted = newProgress >= 100;

            await prisma.task.update({
                where: { id: taskId },
                data: {
                    progressPercent: newProgress,
                    lastProgressAt: new Date(),
                    status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
                    completedAt: isCompleted ? new Date() : undefined,
                },
            });

            await logger.info(
                'notification',
                `[Action] Progress updated via notification button: ${currentProgress}% → ${newProgress}%`,
                { notificationId, taskId, increment, newProgress },
                userId
            );

            // Save a confirmation message in chat so the AI can acknowledge it
            const ackMessage = isCompleted
                ? `✅ Task marked as complete via notification.`
                : `📊 Progress updated to ${newProgress}% via notification action (+${increment}%).`;

            await chatService.saveMessage(userId, 'assistant', ackMessage, null, null, {
                notificationId,
                actionType: 'PROGRESS',
                progress: newProgress,
            });

        } else if (type === 'REPLY') {
            // ── Inline text reply ─────────────────────────────────────────────
            if (!text || !String(text).trim()) {
                await logger.warn('notification', 'notificationAction: empty reply text', { notificationId });
                return;
            }

            const trimmedText = String(text).trim();

            // Save as a user message in chat
            await chatService.saveMessage(userId, 'user', trimmedText, null, null, {
                notificationId,
                actionType: 'INLINE_REPLY',
                source: 'notification_remote_input',
            });

            await logger.info(
                'notification',
                `[Action] Inline reply received via notification`,
                { notificationId, textLength: trimmedText.length },
                userId
            );

            // Note: The AI chat response will be triggered by the existing chat
            // pipeline when the user opens the app. We intentionally do NOT
            // trigger a real-time AI response here since there is no WebSocket
            // channel available from a BroadcastReceiver context.
        }

    } catch (err: any) {
        await logger.error('notification', 'notificationAction handler error', { error: err.message, notificationId });
    }
}
