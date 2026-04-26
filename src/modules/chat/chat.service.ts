// src/modules/chat/chat.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Permanent chat history stored in PostgreSQL.
// Replaces the old Redis-based chat:history:{userId} approach.
//
// getConversationWindow() ensures the window never returns orphaned tool
// messages — if the oldest message is role:'tool', it fetches the preceding
// role:'assistant' message that holds the matching tool_calls array.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../../config/database';

// ── Groq-compatible message format ─────────────────────────────────────────

export interface GroqMessage {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content?: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

export const chatService = {

    /**
     * Persist a message to the ChatMessage table.
     */
    async saveMessage(
        userId: string,
        role: string,
        content?: string | null,
        toolCalls?: any[] | null,
        toolCallId?: string | null,
        metadata?: Record<string, any> | null,
        readAt?: Date | null,
    ): Promise<void> {
        await prisma.chatMessage.create({
            data: {
                userId,
                role,
                content: content ?? null,
                toolCalls: toolCalls ? (toolCalls as any) : undefined,
                toolCallId: toolCallId ?? null,
                metadata: metadata ? (metadata as any) : undefined,
                readAt: readAt ?? null,
            },
        });
    },

    /**
     * Fetch the last `limit` messages for this user, in chronological order.
     *
     * Aggressive Context Compression:
     * - Limit window to 5 messages by default.
     * - Strips `role: tool` messages and their preceding `tool_calls` array
     *   if they belong to old turns, since the DB already stores their side effects.
     */
    async getConversationWindow(userId: string, limit = 5): Promise<GroqMessage[]> {
        // Fetch the most recent `limit` messages, ordered newest-first
        const rows = await prisma.chatMessage.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Reverse to chronological order
        const window = rows.reverse();

        // ── Orphan guard ────────────────────────────────────────────────────
        // If the earliest message in the window is a tool response, the
        // Groq API requires the preceding assistant tool_call message.
        if (window.length > 0 && window[0].role === 'tool') {
            const earliestCreatedAt = window[0].createdAt;
            const preceding = await prisma.chatMessage.findFirst({
                where: {
                    userId,
                    createdAt: { lt: earliestCreatedAt },
                    role: 'assistant',
                },
                orderBy: { createdAt: 'desc' },
            });
            if (preceding) {
                window.unshift(preceding);
            }
        }

        // ── Map to Groq message format ──────────────────────────────────────
        const rawMessages = window.map((msg): GroqMessage => {
            let content = msg.content ?? null;
            
            // Inject hidden system context from metadata if present (ONLY for LLM consumption)
            if (msg.metadata && (msg.metadata as any).hiddenSystemContext) {
                content = (content ? content + '\n\n' : '') + (msg.metadata as any).hiddenSystemContext;
            }

            return {
                role: msg.role as GroqMessage['role'],
                content,
                ...(msg.toolCalls ? { tool_calls: msg.toolCalls as any[] } : {}),
                ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
            };
        });

        // ── Payload Compression ─────────────────────────────────────────────
        // Drop tool messages and tool_calls that are not explicitly related
        // to the CURRENT turn. They bloat the context incredibly fast.
        
        // Find the index of the MOST RECENT user message.
        // Any tool message before this index is from a past turn and can be stripped.
        const lastUserIndex = rawMessages.map(m => m.role).lastIndexOf('user');
        
        if (lastUserIndex === -1) {
            return rawMessages;
        }

        const compressedMessages: GroqMessage[] = [];
        
        for (let i = 0; i < rawMessages.length; i++) {
            const msg = rawMessages[i];
            
            // If the message is BEFORE the last user turn...
            if (i < lastUserIndex) {
                 // Drop tool response payloads entirely
                if (msg.role === 'tool') continue;
                
                // Drop the tool_calls array from old assistant messages
                if (msg.role === 'assistant' && msg.tool_calls) {
                    compressedMessages.push({
                        role: 'assistant',
                        content: msg.content ?? "Executed actions successfully."
                    });
                    continue;
                }
            }
            
            // Otherwise, keep the message as-is
            compressedMessages.push(msg);
        }

        return compressedMessages;
    },

    /**
     * Fetch user-facing chat history for the frontend UI.
     * Excludes system prompts and raw tool-call objects.
     */
    async getChatHistory(userId: string, limit = 50, beforeMs?: number) {
        const where: any = {
            userId,
            role: { in: ['user', 'assistant'] },
            content: { not: null, notIn: [''] }
        };

        if (beforeMs) {
            where.createdAt = { lt: new Date(beforeMs) };
        }

        const rows = await prisma.chatMessage.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        // Map to frontend ChatMessage format
        return rows.reverse().map(msg => ({
            id: msg.id,
            text: msg.content,
            sender: msg.role === 'user' ? 'USER' : 'AI',
            timestamp: msg.createdAt.getTime(),
            readAt: msg.readAt ? msg.readAt.getTime() : null,
            // Pass any UI-specific metadata if stored
            ...(msg.metadata ? { responseMode: (msg.metadata as any)?.responseMode } : {})
        }));
    },

    /**
     * Mark all unread assistant messages as seen for a user.
     */
    async markAsRead(userId: string): Promise<void> {
        await prisma.chatMessage.updateMany({
            where: {
                userId,
                role: 'assistant',
                readAt: null
            },
            data: {
                readAt: new Date()
            }
        });
    },

    /**
     * Clear all chat history for a user (useful for testing / logout).
     */
    async clearHistory(userId: string): Promise<void> {
        await prisma.chatMessage.deleteMany({ where: { userId } });
    },
};
