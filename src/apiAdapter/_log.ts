// src/apiAdapter/_log.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared HTTP logging wrapper for all API adapters.
// Wraps every axios call with structured logs so you can see:
//   ▶ [label] METHOD url  + request body
//   ✅ [label] METHOD url  + response summary (200ms)
//   ❌ [label] METHOD url  + HTTP status + full error body
//
// This is the PRIMARY debugging tool for understanding why a tool call fails.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../utils/logger';

/**
 * Wraps any axios call with request + response logging.
 *
 * @param label   Human label e.g. "dreamApi.syncDreamState"
 * @param method  HTTP method for log display e.g. "POST"
 * @param url     Full URL being called
 * @param body    Request body (for logging only — not sent again)
 * @param fn      The actual axios call to execute
 */
export async function apiCall<T>(
    label: string,
    method: string,
    url: string,
    body: any,
    fn: () => Promise<T>,
): Promise<T> {
    const bodyStr = body ? JSON.stringify(body).slice(0, 500) : '(no body)';

    await logger.info('api-adapter', `[${label}] ▶ ${method} ${url}`, { body: bodyStr });

    const start = Date.now();
    try {
        const result = await fn();
        const ms = Date.now() - start;
        const resStr = JSON.stringify(result).slice(0, 300);
        await logger.info('api-adapter', `[${label}] ✅ ${method} ${url} — ${ms}ms`, { response: resStr });
        return result;
    } catch (err: any) {
        const ms = Date.now() - start;
        const status = err?.response?.status ?? 'N/A';
        const errBody = err?.response?.data;
        const errBodyStr = errBody ? JSON.stringify(errBody).slice(0, 500) : err.message;
        await logger.error('api-adapter', `[${label}] ❌ ${method} ${url} — HTTP ${status} (${ms}ms)`, {
            errorBody: errBodyStr,
            message: err.message,
        });
        throw err;
    }
}
