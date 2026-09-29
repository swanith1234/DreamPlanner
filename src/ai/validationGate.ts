// src/ai/validationGate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Validation Gate: Sits between LLM structured output and Tool Execution.
// Ensures LLM outputs never mutate PostgreSQL with non-existent UUIDs or
// illegal state transitions.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../config/database';
import { logger } from '../utils/logger';

export interface ValidationGateResult {
    isValid: boolean;
    sanitizedArgs?: Record<string, any>;
    rejectionReason?: string;
}

export async function validateToolCall(
    userId: string,
    toolName: string,
    rawArgs: Record<string, any>
): Promise<ValidationGateResult> {
    if (!toolName || typeof toolName !== 'string') {
        return { isValid: false, rejectionReason: 'Tool name is missing or invalid' };
    }

    try {
        // 1. Tool Registry Check
        const toolRecord = await prisma.toolRegistry.findUnique({ where: { name: toolName } });
        if (!toolRecord) {
            return { isValid: false, rejectionReason: `Tool "${toolName}" is not registered in ToolRegistry` };
        }

        const sanitized = { ...rawArgs };

        // 2. Validate Tier 1 Entity Existence - Task ID
        if (sanitized.taskId && typeof sanitized.taskId === 'string') {
            // Must be a valid UUID format if passed directly
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.taskId);
            if (isUuid) {
                const task = await prisma.task.findFirst({
                    where: { id: sanitized.taskId, userId }
                });
                if (!task) {
                    return {
                        isValid: false,
                        rejectionReason: `Task ID "${sanitized.taskId}" does not exist in Tier 1 database for user.`
                    };
                }
            }
        }

        // 3. Validate Tier 1 Entity Existence - Dream ID
        if (sanitized.dreamId && typeof sanitized.dreamId === 'string') {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.dreamId);
            if (isUuid) {
                const dream = await prisma.dream.findFirst({
                    where: { id: sanitized.dreamId, userId }
                });
                if (!dream) {
                    return {
                        isValid: false,
                        rejectionReason: `Dream ID "${sanitized.dreamId}" does not exist in Tier 1 database for user.`
                    };
                }
            }
        }

        // 4. Validate State Transitions
        if (toolName === 'completeTask' && sanitized.taskId) {
            const task = await prisma.task.findUnique({ where: { id: sanitized.taskId } });
            if (task?.status === 'COMPLETED') {
                return { isValid: false, rejectionReason: `Task "${task.title}" is already completed.` };
            }
        }

        return { isValid: true, sanitizedArgs: sanitized };
    } catch (err: any) {
        await logger.warn('validation-gate', `Validation error: ${err.message}`, {});
        return { isValid: false, rejectionReason: `Validation Gate exception: ${err.message}` };
    }
}
