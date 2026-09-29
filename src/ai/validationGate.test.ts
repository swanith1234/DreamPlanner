// src/ai/validationGate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { validateToolCall } from './validationGate';
import prisma from '../config/database';

vi.mock('../config/database', () => {
    return {
        default: {
            toolRegistry: {
                findUnique: vi.fn(),
            },
            task: {
                findFirst: vi.fn(),
                findUnique: vi.fn(),
            },
            dream: {
                findFirst: vi.fn(),
            },
        },
    };
});

describe('Validation Gate', () => {
    const userId = 'user_val_gate_123';

    it('should reject non-existent tool names', async () => {
        vi.mocked(prisma.toolRegistry.findUnique).mockResolvedValue(null);

        const res = await validateToolCall(userId, 'nonExistentTool', {});

        expect(res.isValid).toBe(false);
        expect(res.rejectionReason).toContain('is not registered');
    });

    it('should reject hallucinated task UUIDs that do not exist in Tier 1 DB', async () => {
        vi.mocked(prisma.toolRegistry.findUnique).mockResolvedValue({ name: 'updateTask' } as any);
        vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

        const fakeUuid = '123e4567-e89b-12d3-a456-426614174000';
        const res = await validateToolCall(userId, 'updateTask', { taskId: fakeUuid });

        expect(res.isValid).toBe(false);
        expect(res.rejectionReason).toContain('does not exist in Tier 1 database');
    });

    it('should approve valid tool calls with existing DB entities', async () => {
        vi.mocked(prisma.toolRegistry.findUnique).mockResolvedValue({ name: 'updateTask' } as any);
        vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', title: 'Task 1' } as any);

        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const res = await validateToolCall(userId, 'updateTask', { taskId: validUuid, title: 'Updated' });

        expect(res.isValid).toBe(true);
        expect(res.sanitizedArgs).toEqual({ taskId: validUuid, title: 'Updated' });
    });

    it('should reject completing an already completed task', async () => {
        vi.mocked(prisma.toolRegistry.findUnique).mockResolvedValue({ name: 'completeTask' } as any);
        vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', status: 'COMPLETED' } as any);
        vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: '123e4567-e89b-12d3-a456-426614174000', status: 'COMPLETED', title: 'Done task' } as any);

        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        const res = await validateToolCall(userId, 'completeTask', { taskId: validUuid });

        expect(res.isValid).toBe(false);
        expect(res.rejectionReason).toContain('already completed');
    });
});
