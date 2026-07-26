import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { generateEmbedding } from '../lib/embeddings';
import { logger } from '../utils/logger';

export type RouterResult =
  | { status: 'NO_MATCH' }
  | { status: 'AMBIGUOUS'; candidates: string[]; topTool: any; secondTool: any }
  | { status: 'SUCCESS'; tool: any };

export async function getRelevantTools(message: string): Promise<RouterResult> {
    try {
        const queryEmbedding = await generateEmbedding(message);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        // Extract significant words for ILIKE keyword matching
        const tokens = message
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(t => t.length > 3)
            .map(t => `%${t}%`);

        let tools: any[];

        if (tokens.length > 0) {
            tools = await prisma.$queryRaw`
                SELECT
                    "name",
                    "rawJsonSchema",
                    ((1 - ("embedding" <=> ${embeddingStr}::vector)) + (CASE WHEN "name" ILIKE ANY (ARRAY[${Prisma.join(tokens)}]::text[]) OR "semanticDescription" ILIKE ANY (ARRAY[${Prisma.join(tokens)}]::text[]) THEN 0.15 ELSE 0 END)) AS "finalScore"
                FROM "ToolRegistry"
                ORDER BY "finalScore" DESC
                LIMIT 10;
            `;
        } else {
            tools = await prisma.$queryRaw`
                SELECT
                    "name",
                    "rawJsonSchema",
                    (1 - ("embedding" <=> ${embeddingStr}::vector)) AS "finalScore"
                FROM "ToolRegistry"
                ORDER BY "finalScore" DESC
                LIMIT 2;
            `;
        }

        if (!tools || tools.length === 0) {
            return { status: 'NO_MATCH' };
        }

        // Apply explicit entity boost based on exact nouns in the user message
        const msgLower = message.toLowerCase();
        let scoredTools = tools.map((t: any) => {
            let score = Number(t.finalScore);
            const toolNameLower = String(t.name).toLowerCase();
            
            // If user specifically asked to create/update a dream (but not task)
            if (msgLower.includes('dream') && !msgLower.includes('task') && toolNameLower.includes('dream')) {
                score += 0.05;
                if ((msgLower.includes('create') || msgLower.includes('new')) && toolNameLower === 'syncdreamstate') {
                    score += 0.05; // Extra boost for creating a dream
                }
            } 
            // If user specifically asked to create/update a task (but not dream)
            else if (msgLower.includes('task') && !msgLower.includes('dream') && toolNameLower.includes('task')) {
                score += 0.05;
                if ((msgLower.includes('create') || msgLower.includes('new')) && toolNameLower === 'createtask') {
                    score += 0.05; // Extra boost for creating a task
                }
            }
            
            return { ...t, finalScore: score };
        });

        // Re-sort after boosting
        scoredTools.sort((a, b) => b.finalScore - a.finalScore);

        const topScore = scoredTools[0].finalScore;

        // Log ALL tool scores for every query — use this to tune thresholds
        await logger.info('hybridRouter', '[ROUTER SCORES]', {
            query: message.slice(0, 80),
            results: scoredTools.map((t: any) => ({
                name: t.name,
                score: Number(t.finalScore).toFixed(4),
            })),
        });

        await logger.info('hybridRouter',
            `[ROUTER] top="${scoredTools[0].name}" score=${topScore.toFixed(4)}` +
            (scoredTools[1] ? ` | second="${scoredTools[1].name}" score=${Number(scoredTools[1].finalScore).toFixed(4)}` : ''), {});

        if (topScore < 0.60) {
            await logger.info('hybridRouter', '[ROUTER] NO_MATCH — score below 0.60', {});
            return { status: 'NO_MATCH' };
        }

        if (scoredTools.length >= 2) {
            const secondScore = Number(scoredTools[1].finalScore);
            const gap = topScore - secondScore;
            if (gap < 0.03) {
                await logger.info('hybridRouter', `[ROUTER] AMBIGUOUS — gap=${gap.toFixed(4)} < 0.03`, {});
                return {
                    status: 'AMBIGUOUS',
                    candidates: [scoredTools[0].name, scoredTools[1].name],
                    topTool: scoredTools[0].rawJsonSchema,
                    secondTool: scoredTools[1].rawJsonSchema,
                };
            }
        }

        await logger.info('hybridRouter', `[ROUTER] SUCCESS → "${scoredTools[0].name}"`, {});
        return { status: 'SUCCESS', tool: scoredTools[0].rawJsonSchema };

    } catch (error: any) {
        await logger.error('hybridRouter', 'Failed to fetch tools', { error: error.message });
        return { status: 'NO_MATCH' };
    }
}
