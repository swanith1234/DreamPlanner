// src/apiAdapter/userApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for user profile and preferences endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const userApi = {

    async getPreferences(token: string) {
        const { data } = await axios.get(`${BASE}/api/users/preferences`, { headers: headers(token) });
        return data;
    },

    async updatePreferences(token: string, body: {
        motivationTone: string;
        notificationFrequency: number;
        sleepStart: string;
        sleepEnd: string;
        quietHours?: any[];
    }) {
        const { data } = await axios.put(`${BASE}/api/users/preferences`, body, { headers: headers(token) });
        return data;
    },

    async updateProfile(token: string, body: { timezone: string }) {
        const { data } = await axios.put(`${BASE}/api/users/profile`, body, { headers: headers(token) });
        return data;
    },
};
