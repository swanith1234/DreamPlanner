// src/ai/hindsightService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hindsight Agentic Memory Engine Wrapper (retain, recall, reflect)
// Docs: https://github.com/vectorize-io/hindsight
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../utils/logger';
import { env } from '../config/env';

export interface MemoryItem {
    id: string;
    content: string;
    eventType: string;
    timestamp: string;
    metadata?: Record<string, any>;
    score?: number;
}

export interface RetainInput {
    userId: string;
    eventType: string;
    content: string;
    metadata?: Record<string, any>;
}

export interface RecallInput {
    userId: string;
    query: string;
    tags?: string[];
    topK?: number;
}

// ── In-Memory Mock Store for Offline / Testing / Fallback ───────────────────
const inMemoryBank = new Map<string, MemoryItem[]>();

function getHindsightConfig() {
    const apiUrl = (env.ai as any)?.hindsightApiUrl || process.env.HINDSIGHT_API_URL;
    const apiKey = (env.ai as any)?.hindsightApiKey || process.env.HINDSIGHT_API_KEY;
    return { apiUrl, apiKey };
}

export const hindsightService = {
    /**
     * RETAIN: Store a new event or behavioral observation in the user's memory bank.
     */
    async retain(input: RetainInput): Promise<MemoryItem> {
        const memoryItem: MemoryItem = {
            id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            content: input.content,
            eventType: input.eventType,
            timestamp: new Date().toISOString(),
            metadata: input.metadata ?? {},
        };

        const bankKey = `user_${input.userId}`;
        const { apiUrl, apiKey } = getHindsightConfig();

        // Attempt live Hindsight API if configured
        if (apiUrl && apiKey) {
            try {
                const res = await fetch(`${apiUrl}/v1/banks/${bankKey}/memories`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        event_type: input.eventType,
                        content: input.content,
                        metadata: input.metadata ?? {},
                    }),
                });
                if (res.ok) {
                    const data: any = await res.json();
                    await logger.info('hindsight', `Retained live memory for user ${input.userId}`, { memoryId: data.id });
                    return { ...memoryItem, id: data.id || memoryItem.id };
                }
            } catch (err: any) {
                await logger.warn('hindsight', `Hindsight API retain failed, falling back to local bank: ${err.message}`, {});
            }
        }

        // Local Fallback Storage
        if (!inMemoryBank.has(bankKey)) {
            inMemoryBank.set(bankKey, []);
        }
        inMemoryBank.get(bankKey)!.unshift(memoryItem);
        await logger.info('hindsight', `Retained in-memory record for user ${input.userId}`, { memoryId: memoryItem.id });
        return memoryItem;
    },

    /**
     * RECALL: Query relevant past memories and reflections for prompt compilation.
     */
    async recall(input: RecallInput): Promise<MemoryItem[]> {
        const bankKey = `user_${input.userId}`;
        const topK = input.topK ?? 3;
        const { apiUrl, apiKey } = getHindsightConfig();

        if (apiUrl && apiKey) {
            try {
                const res = await fetch(`${apiUrl}/v1/banks/${bankKey}/recall`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        query: input.query,
                        tags: input.tags ?? [],
                        top_k: topK,
                    }),
                });
                if (res.ok) {
                    const data: any = await res.json();
                    return data.memories ?? [];
                }
            } catch (err: any) {
                await logger.warn('hindsight', `Hindsight API recall failed, falling back to local query: ${err.message}`, {});
            }
        }

        // Local Memory Retrieval (Keyword & Recency Scored)
        const userMemories = inMemoryBank.get(bankKey) ?? [];
        if (userMemories.length === 0) return [];

        const queryTerms = input.query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        
        const scored = userMemories.map(m => {
            let score = 0.1; // baseline recency
            const contentLower = m.content.toLowerCase();
            for (const term of queryTerms) {
                if (contentLower.includes(term)) {
                    score += 0.3;
                }
            }
            return { ...m, score };
        });

        scored.sort((a, b) => (b.score || 0) - (a.score || 0));
        return scored.slice(0, topK);
    },

    /**
     * REFLECT: Triggers cognitive pattern synthesis over accumulated memories.
     */
    async reflect(userId: string): Promise<{ success: boolean; synthesisCount?: number }> {
        const bankKey = `user_${userId}`;
        const { apiUrl, apiKey } = getHindsightConfig();

        if (apiUrl && apiKey) {
            try {
                const res = await fetch(`${apiUrl}/v1/banks/${bankKey}/reflect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });
                if (res.ok) {
                    await logger.info('hindsight', `Reflect triggered for user ${userId}`, {});
                    return { success: true };
                }
            } catch (err: any) {
                await logger.warn('hindsight', `Hindsight API reflect failed: ${err.message}`, {});
            }
        }

        // Local reflection simulation
        const memories = inMemoryBank.get(bankKey) ?? [];
        await logger.info('hindsight', `Reflected over ${memories.length} local memories for user ${userId}`, {});
        return { success: true, synthesisCount: memories.length };
    },

    /** Helper for clearing test bank state */
    _clearBank(userId?: string) {
        if (userId) {
            inMemoryBank.delete(`user_${userId}`);
        } else {
            inMemoryBank.clear();
        }
    }
};
