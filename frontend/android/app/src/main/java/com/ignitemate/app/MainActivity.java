package com.ignitemate.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity
 *
 * Extends BridgeActivity (Capacitor) and adds deep-link handling so that
 * tapping the notification body opens the app AND navigates to the correct
 * in-app route (e.g. /app/tasks/:taskId).
 *
 * Flow:
 *  1. MyFirebaseMessagingService builds a local notification.
 *  2. The body tap PendingIntent starts this Activity with a "deepLink" extra.
 *  3. onCreate / onNewIntent reads the extra and calls navigateToDeepLink().
 *  4. navigateToDeepLink() waits for the Capacitor Bridge to be ready, then
 *     evaluates JS: window.location.href = '<deepLink>'.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
    }

    /**
     * Called when the Activity is already running (singleTask launch mode)
     * and a new Intent arrives — e.g. the user taps another notification
     * while the app is already in the foreground.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void handleDeepLink(Intent intent) {
        if (intent == null) return;

        final String deepLink = intent.getStringExtra("deepLink");
        if (deepLink == null || deepLink.isEmpty()) return;

        // Wait until the Capacitor bridge is ready before evaluating JS.
        // getBridge() may return null if the bridge is not yet initialised.
        if (getBridge() != null) {
            navigateToDeepLink(deepLink);
        } else {
            // Bridge isn't ready — post a short delay and retry once.
            // The WebView usually loads within 500 ms on modern devices.
            new android.os.Handler(android.os.Looper.getMainLooper())
                    .postDelayed(() -> navigateToDeepLink(deepLink), 800);
        }
    }

    /**
     * Evaluates JavaScript in the Capacitor WebView to navigate to the
     * deep-link path. React Router picks this up immediately.
     *
     * We use history.pushState instead of window.location.href to avoid a
     * full page reload when the app is already running.
     */
    private void navigateToDeepLink(String path) {
        if (getBridge() == null) return;

        // Sanitise the path — must start with /
        final String safePath = path.startsWith("/") ? path : "/" + path;

        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(
                "(function() {" +
                "  try {" +
                "    if (window.history && window.history.pushState) {" +
                "      window.history.pushState({}, '', '" + safePath + "');" +
                "      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));" +
                "    } else {" +
                "      window.location.href = '" + safePath + "';" +
                "    }" +
                "  } catch(e) { console.error('[IgniteMate] deepLink nav error', e); }" +
                "})()",
                null
            )
        );
    }
}
