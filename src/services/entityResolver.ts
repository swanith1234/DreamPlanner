import prisma from '../config/database';
import { generateEmbedding } from '../lib/embeddings';
import { logger } from '../utils/logger';

export async function resolveTask(userId: string, keyword: string): Promise<string | null> {
    try {
        const queryEmbedding = await generateEmbedding(keyword);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        const kw = `%${keyword}%`;

        const tasks: any[] = await prisma.$queryRaw`
            SELECT 
                "id", 
                ((1 - ("embedding" <=> ${embeddingStr}::vector)) + (CASE WHEN "title" ILIKE ${kw} THEN 0.2 ELSE 0 END)) AS "finalScore"
            FROM "Task"
            WHERE "userId" = ${userId}
            ORDER BY "finalScore" DESC
            LIMIT 1;
        `;

        if (tasks.length > 0 && tasks[0].finalScore > 0.6) {
            return tasks[0].id;
        }
        return null;
    } catch (error: any) {
        await logger.error('entityResolver', 'Failed to resolve task', { error: error.message });
        return null;
    }
}

export async function resolveDream(userId: string, keyword: string): Promise<string | null> {
    try {
        const queryEmbedding = await generateEmbedding(keyword);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        const kw = `%${keyword}%`;

        const dreams: any[] = await prisma.$queryRaw`
            SELECT 
                "id", 
                ((1 - ("embedding" <=> ${embeddingStr}::vector)) + (CASE WHEN "title" ILIKE ${kw} THEN 0.2 ELSE 0 END)) AS "finalScore"
            FROM "Dream"
            WHERE "userId" = ${userId}
            ORDER BY "finalScore" DESC
            LIMIT 1;
        `;

        if (dreams.length > 0 && dreams[0].finalScore > 0.6) {
            return dreams[0].id;
        }
        return null;
    } catch (error: any) {
        await logger.error('entityResolver', 'Failed to resolve dream', { error: error.message });
        return null;
    }
}
