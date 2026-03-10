// src/ai/schemas/checkpointSchema.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared Zod schemas for checkpoint objects.
// Used by parameterExtractor (validate user input) and orchestrator
// (validate AI-generated checkpoint suggestions before saving draft).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Task Checkpoint (for CREATE_TASK checkpoints[]) ──────────────────────────
export const TaskCheckpointSchema = z.object({
    title: z.string().min(1, 'Checkpoint title cannot be empty'),
    targetDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'targetDate must be in YYYY-MM-DD format'),
    orderIndex: z.number().int().min(0, 'orderIndex must be a non-negative integer'),
});

export type TaskCheckpointInput = z.infer<typeof TaskCheckpointSchema>;

export const TaskCheckpointArraySchema = z.array(TaskCheckpointSchema).min(1);

// ── Dream Checkpoint (for CONFIRM_DREAM checkpoints[]) ───────────────────────
export const DreamCheckpointSchema = z.object({
    title: z.string().min(1, 'Checkpoint title cannot be empty'),
    orderIndex: z.number().int().min(0),
    description: z.string().optional(),
    expectedEffort: z.number().int().min(0).optional(), // hours
    miniDeadline: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'miniDeadline must be YYYY-MM-DD')
        .optional(),
});

export type DreamCheckpointInput = z.infer<typeof DreamCheckpointSchema>;

export const DreamCheckpointArraySchema = z.array(DreamCheckpointSchema).min(1);
