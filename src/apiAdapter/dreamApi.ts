// src/apiAdapter/dreamApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all dream REST endpoints.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const dreamApi = {

    async syncDreamState(token: string, body: any) {
        return apiCall('dreamApi.syncDreamState', 'POST', `${BASE}/api/dreams/sync`, body,
            () => axios.post(`${BASE}/api/dreams/sync`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async createDraft(token: string, body: {
        title: string;
        description: string;
        deadline: string;
        impactScore: number;
        motivationStatement: string;
    }) {
        return apiCall('dreamApi.createDraft', 'POST', `${BASE}/api/dreams`, body,
            () => axios.post(`${BASE}/api/dreams`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async validateDream(token: string, dreamId: string) {
        return apiCall('dreamApi.validateDream', 'POST', `${BASE}/api/dreams/${dreamId}/validate`, null,
            () => axios.post(`${BASE}/api/dreams/${dreamId}/validate`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async confirmDream(token: string, dreamId: string, checkpoints: any[]) {
        return apiCall('dreamApi.confirmDream', 'POST', `${BASE}/api/dreams/${dreamId}/confirm`, { checkpoints },
            () => axios.post(`${BASE}/api/dreams/${dreamId}/confirm`, { checkpoints }, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateDream(token: string, dreamId: string, body: Record<string, any>) {
        return apiCall('dreamApi.updateDream', 'PUT', `${BASE}/api/dreams/${dreamId}`, body,
            () => axios.put(`${BASE}/api/dreams/${dreamId}`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async archiveDream(token: string, dreamId: string) {
        return apiCall('dreamApi.archiveDream', 'DELETE', `${BASE}/api/dreams/${dreamId}`, null,
            () => axios.delete(`${BASE}/api/dreams/${dreamId}`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async completeDream(token: string, dreamId: string) {
        return apiCall('dreamApi.completeDream', 'POST', `${BASE}/api/dreams/${dreamId}/complete`, null,
            () => axios.post(`${BASE}/api/dreams/${dreamId}/complete`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async failDream(token: string, dreamId: string) {
        return apiCall('dreamApi.failDream', 'POST', `${BASE}/api/dreams/${dreamId}/fail`, null,
            () => axios.post(`${BASE}/api/dreams/${dreamId}/fail`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getDream(token: string, dreamId: string) {
        return apiCall('dreamApi.getDream', 'GET', `${BASE}/api/dreams/${dreamId}`, null,
            () => axios.get(`${BASE}/api/dreams/${dreamId}`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async listDreams(token: string, status?: string) {
        const params: Record<string, string> = {};
        if (status) params.status = status;
        const urlWithParams = `${BASE}/api/dreams${status ? `?status=${status}` : ''}`;
        return apiCall('dreamApi.listDreams', 'GET', urlWithParams, null,
            () => axios.get(`${BASE}/api/dreams`, { headers: headers(token), params }).then(r => r.data)
        );
    },

    async searchDreams(token: string, keyword?: string, status?: string) {
        const params: Record<string, string> = {};
        if (keyword) params.keyword = keyword;
        if (status) params.status = status;
        return apiCall('dreamApi.searchDreams', 'GET', `${BASE}/api/dreams/search`, { keyword, status },
            () => axios.get(`${BASE}/api/dreams/search`, { headers: headers(token), params }).then(r => r.data)
        );
    },
};
