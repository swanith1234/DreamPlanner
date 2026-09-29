// src/ai/hindsightService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { hindsightService } from './hindsightService';

describe('Hindsight Memory Service', () => {
    const testUserId = 'user_test_hindsight_123';

    beforeEach(() => {
        hindsightService._clearBank(testUserId);
    });

    it('should retain a new event memory successfully', async () => {
        const memory = await hindsightService.retain({
            userId: testUserId,
            eventType: 'TASK_COMPLETED',
            content: 'User finished system design task in 3 hours',
            metadata: { taskId: 'task-81' },
        });

        expect(memory).toBeDefined();
        expect(memory.id).toContain('mem_');
        expect(memory.content).toBe('User finished system design task in 3 hours');
        expect(memory.eventType).toBe('TASK_COMPLETED');
    });

    it('should recall relevant memories based on semantic keyword match', async () => {
        await hindsightService.retain({
            userId: testUserId,
            eventType: 'PREFERENCE',
            content: 'User prefers smaller daily tasks over weekend marathons',
        });

        await hindsightService.retain({
            userId: testUserId,
            eventType: 'OBSTACLE',
            content: 'User struggled with Docker container deployment',
        });

        const recalled = await hindsightService.recall({
            userId: testUserId,
            query: 'daily task preference',
            topK: 2,
        });

        expect(recalled).toHaveLength(2);
        expect(recalled[0].content).toContain('smaller daily tasks');
    });

    it('should trigger reflection and return synthesis count', async () => {
        await hindsightService.retain({
            userId: testUserId,
            eventType: 'FEEDBACK',
            content: 'User likes empathetic encouragement tone',
        });

        const reflectResult = await hindsightService.reflect(testUserId);

        expect(reflectResult.success).toBe(true);
        expect(reflectResult.synthesisCount).toBe(1);
    });
});
