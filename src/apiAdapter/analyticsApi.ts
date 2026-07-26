// src/apiAdapter/analyticsApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for all analytics REST endpoints.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const analyticsApi = {

    async getDashboard(token: string) {
        return apiCall('analyticsApi.getDashboard', 'GET', `${BASE}/api/analytics/dashboard`, null,
            () => axios.get(`${BASE}/api/analytics/dashboard`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async listSprints(token: string) {
        return apiCall('analyticsApi.listSprints', 'GET', `${BASE}/api/analytics/sprints`, null,
            () => axios.get(`${BASE}/api/analytics/sprints`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async getSprint(token: string, weekStart: string) {
        return apiCall('analyticsApi.getSprint', 'GET', `${BASE}/api/analytics/sprint/${weekStart}`, null,
            () => axios.get(`${BASE}/api/analytics/sprint/${weekStart}`, { headers: headers(token) }).then(r => r.data)
        );
    },
};
