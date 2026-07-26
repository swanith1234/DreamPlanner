// src/apiAdapter/userApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for user profile and preferences endpoints.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const userApi = {

    async getPreferences(token: string) {
        return apiCall('userApi.getPreferences', 'GET', `${BASE}/api/users/preferences`, null,
            () => axios.get(`${BASE}/api/users/preferences`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updatePreferences(token: string, body: {
        motivationTone: string;
        notificationFrequency: number;
        sleepStart: string;
        sleepEnd: string;
        quietHours?: any[];
    }) {
        return apiCall('userApi.updatePreferences', 'PUT', `${BASE}/api/users/preferences`, body,
            () => axios.put(`${BASE}/api/users/preferences`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async updateProfile(token: string, body: { timezone: string }) {
        return apiCall('userApi.updateProfile', 'PUT', `${BASE}/api/users/profile`, body,
            () => axios.put(`${BASE}/api/users/profile`, body, { headers: headers(token) }).then(r => r.data)
        );
    },
};
