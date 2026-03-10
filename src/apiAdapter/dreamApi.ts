// src/apiAdapter/dreamApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all dream REST endpoints.
// Dream creation is a 3-step flow: createDraft → validateDream → confirmDream.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const dreamApi = {

    async createDraft(token: string, body: {
        title: string;
        description: string;
        deadline: string;
        impactScore: number;
        motivationStatement: string;
    }) {
        const { data } = await axios.post(`${BASE}/api/dreams`, body, { headers: headers(token) });
        return data;
    },

    async validateDream(token: string, dreamId: string) {
        const { data } = await axios.post(
            `${BASE}/api/dreams/${dreamId}/validate`,
            {},
            { headers: headers(token) }
        );
        return data;
    },

    async confirmDream(token: string, dreamId: string, checkpoints: any[]) {
        const { data } = await axios.post(
            `${BASE}/api/dreams/${dreamId}/confirm`,
            { checkpoints },
            { headers: headers(token) }
        );
        return data;
    },

    async updateDream(token: string, dreamId: string, body: Record<string, any>) {
        const { data } = await axios.put(`${BASE}/api/dreams/${dreamId}`, body, { headers: headers(token) });
        return data;
    },

    async archiveDream(token: string, dreamId: string) {
        const { data } = await axios.delete(`${BASE}/api/dreams/${dreamId}`, { headers: headers(token) });
        return data;
    },

    async completeDream(token: string, dreamId: string) {
        const { data } = await axios.post(
            `${BASE}/api/dreams/${dreamId}/complete`,
            {},
            { headers: headers(token) }
        );
        return data;
    },

    async failDream(token: string, dreamId: string) {
        const { data } = await axios.post(
            `${BASE}/api/dreams/${dreamId}/fail`,
            {},
            { headers: headers(token) }
        );
        return data;
    },

    async getDream(token: string, dreamId: string) {
        const { data } = await axios.get(`${BASE}/api/dreams/${dreamId}`, { headers: headers(token) });
        return data;
    },

    async listDreams(token: string, status?: string) {
        const params: Record<string, string> = {};
        if (status) params.status = status;
        const { data } = await axios.get(`${BASE}/api/dreams`, { headers: headers(token), params });
        return data;
    },
};
