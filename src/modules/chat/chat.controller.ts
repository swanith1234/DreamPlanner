// src/modules/chat/chat.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single endpoint: POST /api/chat
// Extracts the user message and auth token, delegates entirely to orchestrator.
// ─────────────────────────────────────────────────────────────────────────────

import { Response } from 'express';
import { AuthRequest } from '../../types';
import { orchestrator } from '../../ai/orchestrator';
import { logger } from '../../utils/logger';

export const chatController = {
    async sendMessage(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { message } = req.body;

            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                res.status(400).json({ error: 'message is required and must be a non-empty string' });
                return;
            }

            const userId = req.userId!;

            // Extract the JWT access token from cookie to forward to API adapters
            const token: string = req.cookies?.accessToken || '';
            if (!token) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }

            const response = await orchestrator.process({
                userId,
                message: message.trim(),
                token,
            });

            // response is a ChatResponse: { text, editableContent?, responseMode }
            res.status(200).json(response);

        } catch (error: any) {
            await logger.error('chat', 'Chat controller error', { error: error.message });
            res.status(500).json({ error: 'Something went wrong. Please try again.' });
        }
    },
};
