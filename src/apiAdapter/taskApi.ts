// src/apiAdapter/taskApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all task + checkpoint REST endpoints.
// Forwards the user's auth cookie token so all auth/validation rules apply.
// Never bypasses the existing backend — AI is just another HTTP client.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const taskApi = {

    // ── Tasks ──────────────────────────────────────────────────────────────────

    async createTask(token: string, body: Record<string, any>) {
        const { data } = await axios.post(`${BASE}/api/tasks`, body, { headers: headers(token) });
        return data;
    },

    async updateTask(token: string, taskId: string, body: Record<string, any>) {
        const { data } = await axios.put(`${BASE}/api/tasks/${taskId}`, body, { headers: headers(token) });
        return data;
    },

    async completeTask(token: string, taskId: string) {
        const { data } = await axios.post(`${BASE}/api/tasks/${taskId}/complete`, {}, { headers: headers(token) });
        return data;
    },

    async blockTask(token: string, taskId: string) {
        const { data } = await axios.post(`${BASE}/api/tasks/${taskId}/block`, {}, { headers: headers(token) });
        return data;
    },

    async archiveTask(token: string, taskId: string) {
        const { data } = await axios.delete(`${BASE}/api/tasks/${taskId}`, { headers: headers(token) });
        return data;
    },

    async updateTaskProgress(token: string, taskId: string, value: number) {
        const { data } = await axios.post(
            `${BASE}/api/tasks/${taskId}/progress`,
            { value },
            { headers: headers(token) }
        );
        return data;
    },

    async getTask(token: string, taskId: string) {
        const { data } = await axios.get(`${BASE}/api/tasks/${taskId}`, { headers: headers(token) });
        return data;
    },

    async listTasks(token: string, dreamId?: string, status?: string) {
        const params: Record<string, string> = {};
        if (dreamId) params.dreamId = dreamId;
        if (status) params.status = status;
        const { data } = await axios.get(`${BASE}/api/tasks`, { headers: headers(token), params });
        return data;
    },

    // ── Checkpoints ────────────────────────────────────────────────────────────

    async updateCheckpoint(
        token: string,
        taskId: string,
        checkpointId: string,
        body: { title?: string; targetDate?: string }
    ) {
        const { data } = await axios.put(
            `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`,
            body,
            { headers: headers(token) }
        );
        return data;
    },

    async updateCheckpointProgress(
        token: string,
        taskId: string,
        checkpointId: string,
        delta: number,
        localDate?: string
    ) {
        const { data } = await axios.post(
            `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}/progress`,
            { delta, localDate },
            { headers: headers(token) }
        );
        return data;
    },

    async deleteCheckpoint(token: string, taskId: string, checkpointId: string) {
        const { data } = await axios.delete(
            `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`,
            { headers: headers(token) }
        );
        return data;
    },

    async searchTasks(token: string, query: string, status?: string) {
        const params: Record<string, string> = { q: query };
        if (status) params.status = status;
        const { data } = await axios.get(`${BASE}/api/tasks/search`, { headers: headers(token), params });
        return data;
    },
};
