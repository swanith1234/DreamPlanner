import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

const SECRET = 'test-secret-for-action-tokens';
process.env.JWT_SECRET = SECRET;

// ── Mocks: keep the handler's real logic, stub everything it talks to ────────
// vi.hoisted() is required because vi.mock factories are hoisted above const
// declarations, so the mocks must be created in the hoisted scope too.
const { prismaMock, taskServiceMock, chatServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        notification: { findUnique: vi.fn() },
        notificationAction: { findUnique: vi.fn(), create: vi.fn() },
    },
    taskServiceMock: {
        getTask: vi.fn(),
        updateProgress: vi.fn(),
        updateCheckpointProgress: vi.fn(),
        getActiveCheckpointForTask: vi.fn(),
    },
    chatServiceMock: { saveMessage: vi.fn() },
}));

vi.mock('../../config/database', () => ({ default: prismaMock }));
vi.mock('../task/task.service', () => ({ taskService: taskServiceMock }));
vi.mock('../chat/chat.service', () => ({ chatService: chatServiceMock }));
vi.mock('../../utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { notificationActionHandler } from './notification.action.handler';
import { mintActionToken } from './notificationAction.token';

const OWNER = 'user-owner';
const NOTIF_ID = 'notif-1';
const TASK_ID = 'task-1';
const CP_ID = 'cp-1';

let validToken: string;

beforeAll(() => {
    validToken = mintActionToken({ notificationId: NOTIF_ID, userId: OWNER });
});

function makeRes() {
    const res: any = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.body = payload; return this; },
    };
    return res as Response & { statusCode: number; body: any };
}

/** Run the handler and return the response double. */
async function call(body: any) {
    const res = makeRes();
    await notificationActionHandler({ body } as Request, res as any);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.findUnique.mockResolvedValue({
        id: NOTIF_ID, userId: OWNER, taskId: TASK_ID, checkpointId: CP_ID,
    });
    prismaMock.notificationAction.findUnique.mockResolvedValue(null);
    prismaMock.notificationAction.create.mockResolvedValue({});
    taskServiceMock.updateCheckpointProgress.mockResolvedValue({
        checkpoints: [{ id: CP_ID, progress: 50 }],
    });
});

// ─── Authentication (Part 14) ────────────────────────────────────────────────

describe('notification action — authentication', () => {
    it('rejects a request with no action token', async () => {
        const res = await call({ notificationId: NOTIF_ID, type: 'PROGRESS', value: 10 });

        expect(res.statusCode).toBe(401);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('rejects a body-supplied userId with no token — the old exploit', async () => {
        // Previously this shape was fully accepted and mutated the victim's task.
        const res = await call({
            notificationId: NOTIF_ID, userId: OWNER, type: 'PROGRESS', value: 100,
        });

        expect(res.statusCode).toBe(401);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('rejects a token minted for a different notification', async () => {
        const otherToken = mintActionToken({ notificationId: 'notif-999', userId: OWNER });

        const res = await call({
            notificationId: NOTIF_ID, actionToken: otherToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(403);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('rejects when the notification belongs to someone else', async () => {
        // Defense in depth: token says OWNER, but the row is owned by another user.
        prismaMock.notification.findUnique.mockResolvedValue({
            id: NOTIF_ID, userId: 'someone-else', taskId: TASK_ID, checkpointId: CP_ID,
        });

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(403);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('accepts a valid token and applies the delta', async () => {
        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(200);
        expect(taskServiceMock.updateCheckpointProgress)
            .toHaveBeenCalledWith(TASK_ID, CP_ID, OWNER, 10);
        expect(res.body.progress).toBe(50);
    });
});

// ─── Stale / deleted entities (Part 17) ──────────────────────────────────────

describe('notification action — stale state', () => {
    it('returns 404 when the notification no longer exists', async () => {
        prismaMock.notification.findUnique.mockResolvedValue(null);

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(404);
    });

    it('retargets the active checkpoint when the bound one is already complete', async () => {
        // The bound checkpoint completed after the push was sent, so
        // updateCheckpointProgress rejects it ("only the first incomplete...").
        taskServiceMock.updateCheckpointProgress
            .mockRejectedValueOnce(new Error('Only the first incomplete checkpoint can be updated.'))
            .mockResolvedValueOnce({ checkpoints: [{ id: 'cp-2', progress: 10 }] });
        taskServiceMock.getActiveCheckpointForTask.mockResolvedValue({ id: 'cp-2' });

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(200);
        expect(taskServiceMock.updateCheckpointProgress)
            .toHaveBeenLastCalledWith(TASK_ID, 'cp-2', OWNER, 10);
    });

    it('reports cleanly when every checkpoint is already complete', async () => {
        taskServiceMock.updateCheckpointProgress
            .mockRejectedValueOnce(new Error('Only the first incomplete checkpoint can be updated.'));
        taskServiceMock.getActiveCheckpointForTask.mockResolvedValue(null);

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 10,
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/already complete/i);
    });

    it('falls back to task-level progress when the task has no checkpoints', async () => {
        prismaMock.notification.findUnique.mockResolvedValue({
            id: NOTIF_ID, userId: OWNER, taskId: TASK_ID, checkpointId: null,
        });
        taskServiceMock.getActiveCheckpointForTask.mockResolvedValue(null);
        taskServiceMock.getTask.mockResolvedValue({ progressPercent: 30 });
        taskServiceMock.updateProgress.mockResolvedValue({});

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value: 25,
        });

        expect(res.statusCode).toBe(200);
        expect(taskServiceMock.updateProgress).toHaveBeenCalledWith(TASK_ID, OWNER, 55);
    });
});

// ─── Idempotency (Part 16) ───────────────────────────────────────────────────

describe('notification action — idempotency', () => {
    it('does not re-apply a replayed key — +10% cannot become +20%', async () => {
        prismaMock.notificationAction.findUnique.mockResolvedValue({
            idempotencyKey: 'k1', resultProgress: 50,
        });

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS',
            value: 10, idempotencyKey: 'k1',
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.replayed).toBe(true);
        expect(res.body.progress).toBe(50);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('records the key after a successful mutation', async () => {
        await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS',
            value: 10, idempotencyKey: 'k2',
        });

        expect(prismaMock.notificationAction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    idempotencyKey: 'k2', userId: OWNER, actionType: 'PROGRESS', value: 10,
                }),
            })
        );
    });

    it('tolerates a concurrent duplicate losing the unique-constraint race', async () => {
        const p2002: any = new Error('Unique constraint failed');
        p2002.code = 'P2002';
        prismaMock.notificationAction.create.mockRejectedValue(p2002);

        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS',
            value: 10, idempotencyKey: 'k3',
        });

        expect(res.statusCode).toBe(200);
    });

    it('"Complete" (delta 100) stays at 100 when tapped again', async () => {
        taskServiceMock.updateCheckpointProgress.mockResolvedValue({
            checkpoints: [{ id: CP_ID, progress: 100 }],
        });

        const first = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS',
            value: 100, idempotencyKey: 'done-1',
        });
        expect(first.body.progress).toBe(100);

        // A second, distinct tap still clamps rather than overflowing.
        const second = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS',
            value: 100, idempotencyKey: 'done-2',
        });
        expect(second.body.progress).toBe(100);
    });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('notification action — validation', () => {
    it.each([[-5], [150], ['abc'], [null]])('rejects invalid progress value %s', async (value) => {
        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'PROGRESS', value,
        });

        expect(res.statusCode).toBe(400);
        expect(taskServiceMock.updateCheckpointProgress).not.toHaveBeenCalled();
    });

    it('rejects an unsupported action type', async () => {
        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'DELETE_EVERYTHING',
        });

        expect(res.statusCode).toBe(400);
    });

    it('stores an inline reply as a user message', async () => {
        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'REPLY', text: '  done!  ',
        });

        expect(res.statusCode).toBe(200);
        expect(chatServiceMock.saveMessage).toHaveBeenCalledWith(
            OWNER, 'user', 'done!', null, null,
            expect.objectContaining({ notificationId: NOTIF_ID, actionType: 'INLINE_REPLY' })
        );
    });

    it('rejects an empty reply', async () => {
        const res = await call({
            notificationId: NOTIF_ID, actionToken: validToken, type: 'REPLY', text: '   ',
        });

        expect(res.statusCode).toBe(400);
        expect(chatServiceMock.saveMessage).not.toHaveBeenCalled();
    });
});
