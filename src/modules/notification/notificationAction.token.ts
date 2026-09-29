import jwt from 'jsonwebtoken';

/**
 * Signed capability tokens for notification action buttons.
 *
 * WHY THIS EXISTS
 * ---------------
 * Android fires action buttons from a BroadcastReceiver, which has no access to
 * the app's cookie jar — so `/api/notifications/action` cannot use the normal
 * `accessToken` cookie. The previous design compensated by trusting a `userId`
 * sent in the request body, which meant anyone could POST an arbitrary userId and
 * mutate another account's tasks or inject messages into their chat history.
 *
 * Instead the backend mints a token at DISPATCH time, embeds it in the FCM data
 * payload, and the device echoes it back. The token itself carries the identity,
 * so nothing user-supplied is trusted.
 *
 * SCOPE
 * -----
 * A token authorises actions on exactly ONE notification, for ONE user. It is not
 * a session: it cannot read data, cannot touch other notifications, and grants no
 * access to any other endpoint. Blast radius if leaked is that single reminder.
 *
 * The `typ` claim is verified explicitly so a stolen `accessToken` (signed with
 * the same JWT_SECRET) can never be replayed here, and vice versa.
 */

const TOKEN_TYPE = 'notif_action';

/** Notifications can sit in the shade for days before a user taps them. */
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface ActionTokenClaims {
    notificationId: string;
    userId: string;
}

interface RawClaims extends ActionTokenClaims {
    typ: string;
}

function getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        // Fail loudly rather than falling back to a default — a predictable secret
        // here would let anyone forge an action token for any notification.
        throw new Error('JWT_SECRET is not configured; cannot mint notification action tokens');
    }
    return secret;
}

/** Mint a token authorising actions on one notification, for one user. */
export function mintActionToken(claims: ActionTokenClaims): string {
    return jwt.sign(
        { typ: TOKEN_TYPE, notificationId: claims.notificationId, userId: claims.userId },
        getSecret(),
        { expiresIn: TTL_SECONDS }
    );
}

/**
 * Verify a token echoed back by the device.
 *
 * @returns the claims, or null if the token is missing, malformed, expired,
 *          signed with the wrong key, or is not an action token.
 */
export function verifyActionToken(token: string | undefined | null): ActionTokenClaims | null {
    if (!token || typeof token !== 'string') return null;

    try {
        const decoded = jwt.verify(token, getSecret()) as RawClaims;

        // Reject any token that wasn't minted for this purpose — notably the
        // 15-minute `accessToken`, which shares the same signing secret.
        if (decoded?.typ !== TOKEN_TYPE) return null;
        if (!decoded.notificationId || !decoded.userId) return null;

        return { notificationId: decoded.notificationId, userId: decoded.userId };
    } catch {
        return null;
    }
}
