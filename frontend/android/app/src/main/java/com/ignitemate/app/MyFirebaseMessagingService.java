package com.ignitemate.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

/**
 * MyFirebaseMessagingService
 *
 * Receives DATA-ONLY FCM messages from the backend and builds rich local
 * notifications with:
 *   • Action buttons  — [+25%] [+50%] [Mark Done]
 *   • Inline reply    — RemoteInput ("WhatsApp-style" text box)
 *   • Body tap        — opens MainActivity and deep-links to the task page
 *
 * Why data-only? FCM's notification block cannot include RemoteInput —
 * that feature is only available when we build the notification locally.
 * The backend sets android.priority = HIGH so the device wakes up even
 * when the app is not running.
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    // ── Constants ──────────────────────────────────────────────────────────────
    static final String CHANNEL_ID            = "ignitemate_reminders";
    static final String CHANNEL_NAME          = "Reminders";
    static final String KEY_REPLY_TEXT        = "KEY_REPLY_TEXT";
    static final String ACTION_PROGRESS       = "com.ignitemate.app.ACTION_PROGRESS";
    static final String ACTION_REPLY          = "com.ignitemate.app.ACTION_REPLY";
    static final String EXTRA_NOTIFICATION_ID = "notificationId";
    static final String EXTRA_USER_ID         = "userId";
    static final String EXTRA_TASK_ID         = "taskId";
    static final String EXTRA_PROGRESS_VALUE  = "progressValue";
    static final String EXTRA_NOTIF_INT_ID    = "notifIntId";
    // Signed capability token minted by the backend at dispatch time. This is what
    // authenticates the action — the receiver has no cookie jar, and a body-supplied
    // userId cannot be trusted.
    static final String EXTRA_ACTION_TOKEN    = "actionToken";
    // Stable per-(notification, action) key so an OS PendingIntent replay or an
    // HTTP retry cannot apply the same delta twice.
    static final String EXTRA_IDEMPOTENCY_KEY = "idempotencyKey";
    static final String PREFS_NAME            = "IgniteMatePrefs";
    static final String PREFS_API_URL         = "apiUrl";
    static final String PREFS_USER_ID         = "userId";
    static final String PREFS_AUTH_TOKEN      = "authToken";

    // ── Token refresh ──────────────────────────────────────────────────────────

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // Persist new token — the Capacitor JS layer will pick this up on next
        // app launch and re-register with the backend via /api/notifications/subscribe
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString("fcmToken", token).apply();
    }

    // ── Message received ───────────────────────────────────────────────────────

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty()) return;

        // Extract fields sent by push.service.ts
        String title          = getOrDefault(data, "title", "IgniteMate");
        String body           = getOrDefault(data, "body", "You have a new reminder.");
        String notificationId = getOrDefault(data, "notificationId", "");
        String taskId         = getOrDefault(data, "taskId", "");
        String actionsJson    = getOrDefault(data, "actions", "[]");
        String apiUrl         = getOrDefault(data, "apiUrl", "");
        String userId         = getOrDefault(data, "userId", "");
        String actionToken    = getOrDefault(data, "actionToken", "");
        // Explicit route from the backend. Previously this service rebuilt the path
        // from `taskId`, but the backend only ever sent `url` — so taskId was always
        // empty and every body tap landed on /app/home.
        String deepLink       = getOrDefault(data, "deepLink", getOrDefault(data, "url", ""));

        // Persist apiUrl + userId so NotificationActionReceiver can read them
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (!apiUrl.isEmpty())  prefs.edit().putString(PREFS_API_URL, apiUrl).apply();
        if (!userId.isEmpty())  prefs.edit().putString(PREFS_USER_ID, userId).apply();

        // Unique int id for Android notification manager (use hash of notificationId)
        int notifIntId = notificationId.isEmpty() ? (int) System.currentTimeMillis() : notificationId.hashCode();

        createNotificationChannel();
        buildAndShow(title, body, notificationId, taskId, notifIntId, actionsJson, actionToken, deepLink);
    }

    // ── Build the local notification ───────────────────────────────────────────

    private void buildAndShow(
            String title, String body,
            String notificationId, String taskId,
            int notifIntId, String actionsJson,
            String actionToken, String deepLink) {

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // ── Body tap intent: open app and navigate to task page ──────────────
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("deepLink", deepLink.isEmpty() ? "/app/home" : deepLink);
        openIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);

        PendingIntent openPendingIntent = PendingIntent.getActivity(
                this, notifIntId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // ── Inline reply (RemoteInput) ───────────────────────────────────────
        RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY_TEXT)
                .setLabel("Reply or update progress (e.g. '30%', 'done')...")
                .build();

        Intent replyIntent = new Intent(ACTION_REPLY);
        replyIntent.setPackage(getPackageName());
        replyIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        replyIntent.putExtra(EXTRA_ACTION_TOKEN, actionToken);
        replyIntent.putExtra(EXTRA_TASK_ID, taskId);
        replyIntent.putExtra(EXTRA_NOTIF_INT_ID, notifIntId);

        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                this, notifIntId + 1,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send, "💬 Reply", replyPendingIntent)
                .addRemoteInput(remoteInput)
                .build();

        // ── Progress button actions ──────────────────────────────────────────
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(openPendingIntent)
                .addAction(replyAction);   // Inline reply is always first

        // Parse action buttons from the JSON sent by backend
        try {
            JSONArray actions = new JSONArray(actionsJson);
            // Android renders at most 3 notification actions and the Reply action
            // above already takes one slot — a 3rd progress button is silently dropped.
            for (int i = 0; i < actions.length() && i < 2; i++) {
                JSONObject action = actions.getJSONObject(i);
                String label      = action.getString("label");
                String actionType = action.getString("actionType");
                String value      = action.optString("value", "0");

                Intent progressIntent = new Intent(ACTION_PROGRESS);
                progressIntent.setPackage(getPackageName());
                progressIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
                progressIntent.putExtra(EXTRA_ACTION_TOKEN, actionToken);
                progressIntent.putExtra(EXTRA_TASK_ID, taskId);
                progressIntent.putExtra(EXTRA_PROGRESS_VALUE, value);
                progressIntent.putExtra(EXTRA_NOTIF_INT_ID, notifIntId);
                // Deterministic (not random): baked into the PendingIntent, so an OS
                // replay of the SAME tap reuses the same key and the backend applies
                // the delta once. A later, genuinely new notification has a different
                // notificationId and therefore a different key.
                progressIntent.putExtra(EXTRA_IDEMPOTENCY_KEY,
                        notificationId + "|PROGRESS|" + value);

                PendingIntent progressPending = PendingIntent.getBroadcast(
                        this, notifIntId + 10 + i,
                        progressIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                builder.addAction(new NotificationCompat.Action.Builder(
                        android.R.drawable.ic_menu_upload, label, progressPending).build());
            }
        } catch (Exception e) {
            // Malformed JSON — still show notification without action buttons
        }

        if (nm != null) {
            nm.notify(notifIntId, builder.build());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("IgniteMate goal reminders and progress checks");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private String getOrDefault(Map<String, String> map, String key, String defaultValue) {
        String v = map.get(key);
        return (v != null && !v.isEmpty()) ? v : defaultValue;
    }
}
