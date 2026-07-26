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
                LIMIT 2;
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

        const topScore = Number(tools[0].finalScore);

        await logger.info('hybridRouter',
            `[ROUTER] top="${tools[0].name}" score=${topScore.toFixed(4)}` +
            (tools[1] ? ` | second="${tools[1].name}" score=${Number(tools[1].finalScore).toFixed(4)}` : ''), {});

        if (topScore < 0.60) {
            await logger.info('hybridRouter', '[ROUTER] NO_MATCH — score below 0.60', {});
            return { status: 'NO_MATCH' };
        }

        if (tools.length === 2) {
            const secondScore = Number(tools[1].finalScore);
            const gap = topScore - secondScore;
            if (gap < 0.03) {
                await logger.info('hybridRouter', `[ROUTER] AMBIGUOUS — gap=${gap.toFixed(4)} < 0.03`, {});
                return {
                    status: 'AMBIGUOUS',
                    candidates: [tools[0].name, tools[1].name],
                    topTool: tools[0].rawJsonSchema,
                    secondTool: tools[1].rawJsonSchema,
                };
            }
        }

        await logger.info('hybridRouter', `[ROUTER] SUCCESS → "${tools[0].name}"`, {});
        return { status: 'SUCCESS', tool: tools[0].rawJsonSchema };

    } catch (error: any) {
        await logger.error('hybridRouter', 'Failed to fetch tools', { error: error.message });
        return { status: 'NO_MATCH' };
    }
}
