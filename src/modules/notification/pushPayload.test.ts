import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
    buildNativePushData,
    buildDeepLink,
    REQUIRED_NATIVE_PAYLOAD_KEYS,
} from './pushPayload';

const base = {
    notificationId: 'n-1',
    userId: 'u-1',
    actionToken: 'signed.jwt.here',
    apiUrl: 'https://api.example.com',
};

describe('buildDeepLink', () => {
    it('links to the exact checkpoint when the reminder is bound to one', () => {
        expect(buildDeepLink('t-1', 'cp-1')).toBe('/app/tasks/t-1?checkpoint=cp-1');
    });

    it('falls back to the task page when there is no checkpoint', () => {
        expect(buildDeepLink('t-1', null)).toBe('/app/tasks/t-1');
    });

    it('falls back to home when there is no task', () => {
        expect(buildDeepLink(null, null)).toBe('/app/home');
        expect(buildDeepLink(undefined, 'cp-1')).toBe('/app/home');
    });
});

describe('buildNativePushData', () => {
    it('includes every key the native client requires', () => {
        const data = buildNativePushData({ ...base, taskId: 't-1', checkpointId: 'cp-1' });

        for (const key of REQUIRED_NATIVE_PAYLOAD_KEYS) {
            expect(data, `missing required payload key: ${key}`).toHaveProperty(key);
            expect(String((data as any)[key]).length).toBeGreaterThan(0);
        }
    });

    it('carries userId and taskId — the two keys whose absence made every button a no-op', () => {
        const data = buildNativePushData({ ...base, taskId: 't-1' });

        expect(data.userId).toBe('u-1');
        expect(data.taskId).toBe('t-1');
    });

    it('omits optional keys entirely rather than emitting the string "undefined"', () => {
        // push.service stringifies every value. If an absent taskId were left as
        // undefined it would arrive on the device as "undefined", pass the
        // receiver's non-empty check, and be sent back as a bogus id.
        const data = buildNativePushData(base);

        expect('taskId' in data).toBe(false);
        expect('checkpointId' in data).toBe(false);
        expect('apiPath' in data).toBe(false);
        expect(Object.values(data)).not.toContain('undefined');
        expect(Object.values(data)).not.toContain(undefined);
    });

    it('keeps url and deepLink identical so web and native agree', () => {
        const data = buildNativePushData({ ...base, taskId: 't-1', checkpointId: 'cp-1' });

        expect(data.url).toBe(data.deepLink);
        expect(data.deepLink).toBe('/app/tasks/t-1?checkpoint=cp-1');
    });
});

// ─── Cross-language contract ─────────────────────────────────────────────────
// Reads the Android source directly. This is the check that would have caught the
// original break: the backend sent `url`, the client read `taskId`.
describe('native client contract', () => {
    const javaPath = resolve(
        __dirname,
        '../../../../frontend/android/app/src/main/java/com/ignitemate/app/MyFirebaseMessagingService.java'
    );

    it.skipIf(!existsSync(javaPath))(
        'every data key MyFirebaseMessagingService reads is produced by the builder',
        () => {
            const java = readFileSync(javaPath, 'utf8');

            // Matches: getOrDefault(data, "someKey", ...)
            const keys = [...java.matchAll(/getOrDefault\(\s*data\s*,\s*"([^"]+)"/g)]
                .map((m) => m[1]);

            expect(keys.length).toBeGreaterThan(0);

            const data = buildNativePushData({ ...base, taskId: 't-1', checkpointId: 'cp-1' });

            // Keys supplied elsewhere in the push pipeline (push.service adds these
            // alongside the data block) rather than by buildNativePushData.
            const suppliedByPushService = new Set(['title', 'body', 'icon', 'tag', 'actions']);

            const missing = keys.filter(
                (k) => !suppliedByPushService.has(k) && !(k in data)
            );

            expect(missing, `Android reads keys the backend never sends: ${missing.join(', ')}`)
                .toEqual([]);
        }
    );
});
