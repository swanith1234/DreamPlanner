import { Capacitor } from '@capacitor/core';
import axios from 'axios';

// In production, VITE_API_URL is set to the Render backend URL (via Vercel env vars).
// Locally, it's empty — we rely on Vite's dev server proxy (/api -> http://localhost:3000).
// For native mobile (Capacitor), we MUST use the full backend URL since there's no proxy.
const RENDER_BACKEND = 'https://dreamplanner-lbm7.onrender.com';

let BASE_URL: string;
if (Capacitor.isNativePlatform()) {
    BASE_URL = `${RENDER_BACKEND}/api`;
} else {
    BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
}

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

console.log("API Base URL:", BASE_URL);

// Request interceptor: No need to attach token manually (cookies handle it)
api.interceptors.request.use((config) => {
    return config;
});

let isRefreshing = false;

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const url: string = originalRequest?.url || '';

        // Only skip refresh for endpoints that would cause infinite loops if retried
        const isRefreshEndpoint = url.includes('/auth/refresh');
        const isLoginEndpoint = url.includes('/auth/login') || url.includes('/auth/signup');

        if (error.response?.status === 401 && !originalRequest._retry && !isRefreshEndpoint && !isLoginEndpoint) {
            if (isRefreshing) return Promise.reject(error);

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                await axios.post(
                    `${BASE_URL}/auth/refresh`,
                    {},
                    { withCredentials: true }
                );
                isRefreshing = false;
                // Retry the original request (including /auth/me) with the new access token cookie
                return api(originalRequest);
            } catch (refreshError) {
                isRefreshing = false;
                // If the original request was /auth/me, this is just "not logged in" — AuthContext
                // handles it gracefully (sets user=null). No hard redirect needed.
                const isMeCheck = url.includes('/auth/me');
                if (!isMeCheck && window.location.pathname !== '/login' && window.location.pathname !== '/') {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
