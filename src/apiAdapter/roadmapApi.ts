// src/apiAdapter/roadmapApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all roadmap REST endpoints.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const roadmapApi = {

    async generateRoadmap(token: string, dreamId: string) {
        return apiCall('roadmapApi.generateRoadmap', 'POST', `${BASE}/api/roadmaps/generate`, { dreamId },
            () => axios.post(`${BASE}/api/roadmaps/generate`, { dreamId }, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getActiveRoadmapByDream(token: string, dreamId: string) {
        return apiCall('roadmapApi.getActiveRoadmapByDream', 'GET', `${BASE}/api/roadmaps/dream/${dreamId}/active`, null,
            () => axios.get(`${BASE}/api/roadmaps/dream/${dreamId}/active`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getRoadmap(token: string, roadmapId: string) {
        return apiCall('roadmapApi.getRoadmap', 'GET', `${BASE}/api/roadmaps/${roadmapId}`, null,
            () => axios.get(`${BASE}/api/roadmaps/${roadmapId}`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateRoadmapDraft(token: string, roadmapId: string, draft: any) {
        return apiCall('roadmapApi.updateRoadmapDraft', 'PUT', `${BASE}/api/roadmaps/${roadmapId}`, { draft },
            () => axios.put(`${BASE}/api/roadmaps/${roadmapId}`, { draft }, { headers: headers(token) }).then(r => r.data)
        );
    },

    async activateRoadmap(token: string, roadmapId: string) {
        return apiCall('roadmapApi.activateRoadmap', 'POST', `${BASE}/api/roadmaps/${roadmapId}/activate`, null,
            () => axios.post(`${BASE}/api/roadmaps/${roadmapId}/activate`, {}, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getByDream(token: string, dreamId: string) {
        return apiCall('roadmapApi.getByDream', 'GET', `${BASE}/api/roadmaps/dream/${dreamId}/all`, null,
            () => axios.get(`${BASE}/api/roadmaps/dream/${dreamId}/all`, { headers: headers(token) }).then(r => r.data)
        );
    },
};
