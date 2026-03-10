// src/apiAdapter/notificationApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for notification endpoints accessible via chat.
// Push subscription management is included for completeness but rarely
// triggered via natural language — the registry prevents misclassification.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const notificationApi = {

    async listNotifications(token: string) {
        const { data } = await axios.get(`${BASE}/api/notifications`, { headers: headers(token) });
        return data;
    },

    async subscribe(token: string, body: { endpoint: string; p256dh: string; auth: string }) {
        const { data } = await axios.post(`${BASE}/api/notifications/subscribe`, body, {
            headers: headers(token),
        });
        return data;
    },

    async unsubscribe(token: string, body: { endpoint: string }) {
        const { data } = await axios.post(`${BASE}/api/notifications/unsubscribe`, body, {
            headers: headers(token),
        });
        return data;
    },
};
