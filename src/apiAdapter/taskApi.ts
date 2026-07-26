// src/apiAdapter/taskApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all task + checkpoint REST endpoints.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const taskApi = {

    // ── Tasks ──────────────────────────────────────────────────────────────────

    async createTask(token: string, body: Record<string, any>) {
        return apiCall('taskApi.createTask', 'POST', `${BASE}/api/tasks`, body,
            () => axios.post(`${BASE}/api/tasks`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateTask(token: string, taskId: string, body: Record<string, any>) {
        return apiCall('taskApi.updateTask', 'PUT', `${BASE}/api/tasks/${taskId}`, body,
            () => axios.put(`${BASE}/api/tasks/${taskId}`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async completeTask(token: string, taskId: string) {
        return apiCall('taskApi.completeTask', 'POST', `${BASE}/api/tasks/${taskId}/complete`, null,
            () => axios.post(`${BASE}/api/tasks/${taskId}/complete`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async blockTask(token: string, taskId: string) {
        return apiCall('taskApi.blockTask', 'POST', `${BASE}/api/tasks/${taskId}/block`, null,
            () => axios.post(`${BASE}/api/tasks/${taskId}/block`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async archiveTask(token: string, taskId: string) {
        return apiCall('taskApi.archiveTask', 'DELETE', `${BASE}/api/tasks/${taskId}`, null,
            () => axios.delete(`${BASE}/api/tasks/${taskId}`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateTaskProgress(token: string, taskId: string, value: number) {
        return apiCall('taskApi.updateTaskProgress', 'POST', `${BASE}/api/tasks/${taskId}/progress`, { value },
            () => axios.post(`${BASE}/api/tasks/${taskId}/progress`, { value }, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getTask(token: string, taskId: string) {
        return apiCall('taskApi.getTask', 'GET', `${BASE}/api/tasks/${taskId}`, null,
            () => axios.get(`${BASE}/api/tasks/${taskId}`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async listTasks(token: string, dreamId?: string, status?: string) {
        const params: Record<string, string> = {};
        if (dreamId) params.dreamId = dreamId;
        if (status) params.status = status;
        return apiCall('taskApi.listTasks', 'GET', `${BASE}/api/tasks`, { dreamId, status },
            () => axios.get(`${BASE}/api/tasks`, { headers: headers(token), params }).then(r => r.data)
        );
    },

    async searchTasks(token: string, filter: { q?: string; dreamId?: string; status?: string }) {
        const params: Record<string, string> = {};
        if (filter.q) params.q = filter.q;
        if (filter.dreamId) params.dreamId = filter.dreamId;
        if (filter.status) params.status = filter.status;
        return apiCall('taskApi.searchTasks', 'GET', `${BASE}/api/tasks/search`, filter,
            () => axios.get(`${BASE}/api/tasks/search`, { headers: headers(token), params }).then(r => r.data)
        );
    },

    // ── Checkpoints ────────────────────────────────────────────────────────────

    async updateCheckpoint(
        token: string,
        taskId: string,
        checkpointId: string,
        body: { title?: string; targetDate?: string }
    ) {
        return apiCall('taskApi.updateCheckpoint', 'PUT', `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`, body,
            () => axios.put(`${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateCheckpointProgress(
        token: string,
        taskId: string,
        checkpointId: string,
        delta: number,
        localDate?: string
    ) {
        const body = { delta, localDate };
        return apiCall('taskApi.updateCheckpointProgress', 'POST', `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}/progress`, body,
            () => axios.post(`${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}/progress`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async deleteCheckpoint(token: string, taskId: string, checkpointId: string) {
        return apiCall('taskApi.deleteCheckpoint', 'DELETE', `${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`, null,
            () => axios.delete(`${BASE}/api/tasks/${taskId}/checkpoints/${checkpointId}`, { headers: headers(token) }).then(r => r.data)
        );
    },
};
