package com.ignitemate.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * NotificationActionReceiver
 *
 * Handles two types of notification actions fired by the user:
 *
 *  1. ACTION_PROGRESS  — user tapped a progress button ([+10%], [Complete])
 *     → POSTs {notificationId, actionToken, type:'PROGRESS', value:N, idempotencyKey}
 *
 *  2. ACTION_REPLY     — user typed text in the RemoteInput box and hit Send
 *     → POSTs {notificationId, actionToken, type:'REPLY', text, idempotencyKey}
 *
 * AUTHENTICATION: a BroadcastReceiver has no access to the WebView's cookies, so
 * these calls carry a signed `actionToken` minted by the backend at dispatch time.
 * We deliberately do NOT send a userId — the previous contract did, and the server
 * trusted it, which let anyone mutate any account's tasks.
 *
 * IDEMPOTENCY: `idempotencyKey` is derived from the notification id and the action
 * (not randomly generated), so it is stable across PendingIntent replays. The
 * backend applies a given key at most once.
 *
 * After a successful POST the notification is updated to show "✓ Logged!" then dismissed.
 * Network call is done on a background thread to avoid blocking the main thread.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        final String action         = intent.getAction();
        final String notificationId = intent.getStringExtra(MyFirebaseMessagingService.EXTRA_NOTIFICATION_ID);
        final String actionToken    = intent.getStringExtra(MyFirebaseMessagingService.EXTRA_ACTION_TOKEN);
        final String taskId         = intent.getStringExtra(MyFirebaseMessagingService.EXTRA_TASK_ID);
        final int    notifIntId     = intent.getIntExtra(MyFirebaseMessagingService.EXTRA_NOTIF_INT_ID, 0);
        final String idemKey        = intent.getStringExtra(MyFirebaseMessagingService.EXTRA_IDEMPOTENCY_KEY);

        // The action token IS the credential. Without it the backend has no way to
        // establish identity, so there is nothing useful to send.
        if (notificationId == null || notificationId.isEmpty()
                || actionToken == null || actionToken.isEmpty()) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(
                MyFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE);
        final String apiUrl = prefs.getString(MyFirebaseMessagingService.PREFS_API_URL, "");

        if (apiUrl.isEmpty()) return;

        if (MyFirebaseMessagingService.ACTION_PROGRESS.equals(action)) {
            // ── Progress button tap ────────────────────────────────────────────
            final String progressValue = intent.getStringExtra(
                    MyFirebaseMessagingService.EXTRA_PROGRESS_VALUE);

            showUpdatingState(context, notifIntId);

            new Thread(() -> {
                boolean ok = postAction(apiUrl,
                        buildProgressJson(notificationId, actionToken, progressValue, idemKey));
                updateNotificationAfterAction(context, notifIntId, ok
                        ? "✓ Progress logged! Keep going 🚀"
                        : "⚠ Could not update — check your connection.");
            }).start();

        } else if (MyFirebaseMessagingService.ACTION_REPLY.equals(action)) {
            // ── Inline text reply ──────────────────────────────────────────────
            Bundle remoteInputResults = RemoteInput.getResultsFromIntent(intent);
            if (remoteInputResults == null) return;

            CharSequence replyText = remoteInputResults.getCharSequence(
                    MyFirebaseMessagingService.KEY_REPLY_TEXT);
            if (replyText == null || replyText.toString().trim().isEmpty()) return;

            final String text = replyText.toString().trim();

            // Show a "Sending…" state immediately so the keyboard dismisses
            showSendingState(context, notifIntId, text);

            new Thread(() -> {
                // Hash the text so an exact retry of the same reply dedupes, while a
                // genuinely different reply still goes through.
                String replyKey = notificationId + "|REPLY|" + text.hashCode();
                boolean ok = postAction(apiUrl,
                        buildReplyJson(notificationId, actionToken, text, replyKey));
                updateNotificationAfterAction(context, notifIntId, ok
                        ? "✓ Reply sent! I'll respond shortly 💬"
                        : "⚠ Could not send — check your connection.");
            }).start();
        }
    }

    // ── Network ───────────────────────────────────────────────────────────────

    /**
     * Fire-and-forget POST to /api/notifications/action.
     * Returns true on HTTP 2xx, false on any error.
     */
    private boolean postAction(String apiUrl, String jsonBody) {
        try {
            String endpoint = apiUrl.replaceAll("/$", "") + "/api/notifications/action";
            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }

            int code = conn.getResponseCode();
            conn.disconnect();
            return code >= 200 && code < 300;

        } catch (Exception e) {
            return false;
        }
    }

    // ── JSON builders ─────────────────────────────────────────────────────────

    private String buildProgressJson(String notificationId, String actionToken, String value, String idemKey) {
        return String.format(
                "{\"notificationId\":\"%s\",\"actionToken\":\"%s\",\"type\":\"PROGRESS\","
                        + "\"value\":%s,\"idempotencyKey\":\"%s\"}",
                esc(notificationId), esc(actionToken),
                (value != null ? value : "0"), esc(idemKey != null ? idemKey : "")
        );
    }

    private String buildReplyJson(String notificationId, String actionToken, String text, String idemKey) {
        return String.format(
                "{\"notificationId\":\"%s\",\"actionToken\":\"%s\",\"type\":\"REPLY\","
                        + "\"text\":\"%s\",\"idempotencyKey\":\"%s\"}",
                esc(notificationId), esc(actionToken), esc(text), esc(idemKey != null ? idemKey : "")
        );
    }

    /** Simple JSON string escaping — avoids pulling in a full JSON library. */
    private String esc(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    // ── Notification state helpers ────────────────────────────────────────────

    /** Show "Sending…" immediately so Android dismisses the keyboard. */
    private void showSendingState(Context ctx, int notifIntId, String text) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx,
                MyFirebaseMessagingService.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_send)
                .setContentTitle("IgniteMate")
                .setContentText("Sending: \"" + truncate(text, 40) + "\"…")
                .setPriority(NotificationCompat.PRIORITY_LOW);

        NotificationManager nm = (NotificationManager)
                ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(notifIntId, builder.build());
    }

    /** Show "Updating…" for progress button taps. */
    private void showUpdatingState(Context ctx, int notifIntId) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx,
                MyFirebaseMessagingService.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setContentTitle("IgniteMate")
                .setContentText("Updating progress…")
                .setPriority(NotificationCompat.PRIORITY_LOW);

        NotificationManager nm = (NotificationManager)
                ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(notifIntId, builder.build());
    }

    /** Replace notification with a success/failure message then auto-dismiss after 3 s. */
    private void updateNotificationAfterAction(Context ctx, int notifIntId, String message) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx,
                MyFirebaseMessagingService.CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("IgniteMate")
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(true)
                .setTimeoutAfter(3000); // Auto-dismiss after 3 seconds

        NotificationManager nm = (NotificationManager)
                ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(notifIntId, builder.build());
    }

    private String truncate(String s, int max) {
        return (s != null && s.length() > max) ? s.substring(0, max) + "…" : s;
    }
}
