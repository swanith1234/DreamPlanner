/**
 * The FCM data-payload contract between this backend and the Android client.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * This contract silently broke once already: the backend sent `url` while
 * MyFirebaseMessagingService read `taskId`, and `userId` was never sent at all.
 * Nothing errored — the notification still rendered, the buttons still appeared,
 * and every tap POSTed `userId: ""` which the server rejected. The feature looked
 * present and did nothing.
 *
 * Keeping the builder pure and separately tested means a renamed or dropped key
 * fails a test instead of failing silently on a user's phone.
 *
 * CONSUMERS — keep in sync when changing this:
 *   • android/app/src/main/java/com/ignitemate/app/MyFirebaseMessagingService.java
 *       reads: title, body, notificationId, taskId, actions, apiUrl, actionToken, deepLink
 *   • android/app/src/main/java/com/ignitemate/app/MainActivity.java
 *       reads: deepLink (via the Intent extra the service sets)
 *   • public/sw.js (web push) reads: url
 */

/** Keys the native client depends on. A missing key here is a silent failure. */
export const REQUIRED_NATIVE_PAYLOAD_KEYS = [
    'notificationId',
    'actionToken',
    'deepLink',
    'url',
    'apiUrl',
] as const;

export interface NativePushPayloadInput {
    notificationId: string;
    userId: string;
    /** Signed capability token authorising actions on this notification. */
    actionToken: string;
    taskId?: string | null;
    checkpointId?: string | null;
    apiUrl: string;
    apiPath?: string;
}

export interface NativePushData {
    url: string;
    deepLink: string;
    notificationId: string;
    userId: string;
    actionToken: string;
    apiUrl: string;
    taskId?: string;
    checkpointId?: string;
    apiPath?: string;
}

/**
 * Build the in-app route a notification body tap should open.
 *
 * Deep-links straight to the bound checkpoint when there is one, so the user lands
 * on the thing the reminder was about rather than a task page they must scan.
 */
export function buildDeepLink(taskId?: string | null, checkpointId?: string | null): string {
    if (!taskId) return '/app/home';
    return checkpointId
        ? `/app/tasks/${taskId}?checkpoint=${checkpointId}`
        : `/app/tasks/${taskId}`;
}

/**
 * Assemble the FCM `data` block.
 *
 * Optional fields are omitted rather than set to undefined — push.service
 * stringifies every value, and `String(undefined)` produces the literal
 * "undefined", which passes the client's non-empty checks and is then sent back
 * to the server as a bogus id.
 */
export function buildNativePushData(input: NativePushPayloadInput): NativePushData {
    const deepLink = buildDeepLink(input.taskId, input.checkpointId);

    const data: NativePushData = {
        // `url` is read by the web service worker, `deepLink` by native.
        // They intentionally carry the same value.
        url: deepLink,
        deepLink,
        notificationId: input.notificationId,
        userId: input.userId,
        actionToken: input.actionToken,
        apiUrl: input.apiUrl,
    };

    if (input.taskId) data.taskId = input.taskId;
    if (input.checkpointId) data.checkpointId = input.checkpointId;
    if (input.apiPath) data.apiPath = input.apiPath;

    return data;
}
