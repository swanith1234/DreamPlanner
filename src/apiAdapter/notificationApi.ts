// src/apiAdapter/notificationApi.ts
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrappers for notification endpoints accessible via chat.
// Every call is wrapped with apiCall() for full request/response logging.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { env } from '../config/env';
import { apiCall } from './_log';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
    return { Cookie: `accessToken=${token}` };
}

export const notificationApi = {

    async listNotifications(token: string) {
        return apiCall('notificationApi.listNotifications', 'GET', `${BASE}/api/notifications`, null,
            () => axios.get(`${BASE}/api/notifications`, { headers: headers(token) }).then(r => r.data)
        );
    },

    async subscribe(token: string, body: { endpoint: string; p256dh: string; auth: string }) {
        return apiCall('notificationApi.subscribe', 'POST', `${BASE}/api/notifications/subscribe`, body,
            () => axios.post(`${BASE}/api/notifications/subscribe`, body, { headers: headers(token) }).then(r => r.data)
        );
    },

    async unsubscribe(token: string, body: { endpoint: string }) {
        return apiCall('notificationApi.unsubscribe', 'POST', `${BASE}/api/notifications/unsubscribe`, body,
            () => axios.post(`${BASE}/api/notifications/unsubscribe`, body, { headers: headers(token) }).then(r => r.data)
        );
    },
};
