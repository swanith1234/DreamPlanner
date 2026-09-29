import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { mintActionToken, verifyActionToken } from './notificationAction.token';

const SECRET = 'test-secret-for-action-tokens';

beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
});

describe('notification action tokens', () => {
    it('round-trips the notification and user identity', () => {
        const token = mintActionToken({ notificationId: 'n-1', userId: 'u-1' });

        expect(verifyActionToken(token)).toEqual({ notificationId: 'n-1', userId: 'u-1' });
    });

    it('rejects a token signed with a different secret', () => {
        const forged = jwt.sign(
            { typ: 'notif_action', notificationId: 'n-1', userId: 'victim' },
            'attacker-secret'
        );

        expect(verifyActionToken(forged)).toBeNull();
    });

    it('rejects an accessToken replayed as an action token', () => {
        // The 15-minute access token is signed with the SAME JWT_SECRET.
        // Without a typ check it would authorise notification mutations.
        const accessToken = jwt.sign({ userId: 'u-1', email: 'a@b.c' }, SECRET);

        expect(verifyActionToken(accessToken)).toBeNull();
    });

    it('rejects a token whose typ claim has been altered', () => {
        const wrongType = jwt.sign(
            { typ: 'something_else', notificationId: 'n-1', userId: 'u-1' },
            SECRET
        );

        expect(verifyActionToken(wrongType)).toBeNull();
    });

    it('rejects an expired token', () => {
        const expired = jwt.sign(
            { typ: 'notif_action', notificationId: 'n-1', userId: 'u-1' },
            SECRET,
            { expiresIn: -60 }
        );

        expect(verifyActionToken(expired)).toBeNull();
    });

    it('rejects tokens missing required claims', () => {
        expect(verifyActionToken(jwt.sign({ typ: 'notif_action', userId: 'u-1' }, SECRET))).toBeNull();
        expect(verifyActionToken(jwt.sign({ typ: 'notif_action', notificationId: 'n-1' }, SECRET))).toBeNull();
    });

    it('rejects missing, empty and malformed input', () => {
        expect(verifyActionToken(undefined)).toBeNull();
        expect(verifyActionToken(null)).toBeNull();
        expect(verifyActionToken('')).toBeNull();
        expect(verifyActionToken('not-a-jwt')).toBeNull();
    });

    it('does not let one notification token act on another notification', () => {
        // The handler compares claims.notificationId to the targeted row; this
        // asserts the identity is bound in the token rather than taken from input.
        const token = mintActionToken({ notificationId: 'n-1', userId: 'u-1' });

        expect(verifyActionToken(token)!.notificationId).toBe('n-1');
    });
});
