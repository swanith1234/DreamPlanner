// src/apiAdapter/analyticsApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all analytics REST endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const analyticsApi = {

    async getDashboard(token: string) {
        const { data } = await axios.get(`${BASE}/api/analytics/dashboard`, { headers: headers(token) });
        return data;
    },

    async listSprints(token: string) {
        const { data } = await axios.get(`${BASE}/api/analytics/sprints`, { headers: headers(token) });
        return data;
    },

    async getSprint(token: string, weekStart: string) {
        const { data } = await axios.get(
            `${BASE}/api/analytics/sprint/${weekStart}`,
            { headers: headers(token) }
        );
        return data;
    },
};
