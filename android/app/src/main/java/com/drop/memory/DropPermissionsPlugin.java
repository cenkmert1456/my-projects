package com.drop.memory;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * DropPermissions — honest Android runtime permission state for DROP.
 *
 * Capacitor's official plugins cover camera and notifications, but not
 * microphone state, "permanently denied" detection, or deep-linking into
 * Android's app settings. This tiny plugin fills those gaps with the real
 * OS state — it never fabricates a "granted".
 *
 *   getStatuses()        → camera / microphone / notifications states
 *   requestPermission()  → runtime-request RECORD_AUDIO (microphone)
 *   openAppSettings()    → ACTION_APPLICATION_DETAILS_SETTINGS
 *
 * Photos & documents deliberately have NO permission here: DROP selects them
 * through the Android system Photo Picker / Storage Access Framework, which
 * require no broad storage permission.
 */
@CapacitorPlugin(
    name = "DropPermissions",
    permissions = {
        @com.getcapacitor.annotation.Permission(
            alias = "microphone",
            strings = {Manifest.permission.RECORD_AUDIO}
        )
    }
)
public class DropPermissionsPlugin extends Plugin {

    /** Resolve a runtime permission into granted / denied / permanently denied. */
    private String stateOf(String permission) {
        if (Build.VERSION.SDK_INT < 23) return "granted";
        int check = ContextCompat.checkSelfPermission(getContext(), permission);
        if (check == PackageManager.PERMISSION_GRANTED) return "granted";
        // shouldShowRequestPermissionRationale() == false after a denial means
        // the user checked "don't ask again" (or denied twice) — permanently denied.
        boolean denied = !getActivity().shouldShowRequestPermissionRationale(permission);
        return denied ? "permanently_denied" : "denied";
    }

    @PluginMethod
    public void getStatuses(PluginCall call) {
        JSObject out = new JSObject();
        out.put("camera", stateOf(Manifest.permission.CAMERA));
        out.put("microphone", stateOf(Manifest.permission.RECORD_AUDIO));
        // POST_NOTIFICATIONS only exists on Android 13+; below that the OS
        // grants notifications by default, so report granted.
        if (Build.VERSION.SDK_INT >= 33) {
            out.put("notifications", stateOf(Manifest.permission.POST_NOTIFICATIONS));
        } else {
            out.put("notifications", "granted");
        }
        out.put("sdkInt", Build.VERSION.SDK_INT);
        out.put("photosMode", Build.VERSION.SDK_INT >= 33 ? "photo_picker" : "photo_picker");
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String kind = call.getString("kind", "microphone");
        if ("microphone".equals(kind)) {
            requestPermissionForAlias("microphone", call, "micPermissionResult");
        } else {
            call.reject("Unsupported permission kind: " + kind);
        }
    }

    @PermissionCallback
    private void micPermissionResult(PluginCall call) {
        JSObject out = new JSObject();
        out.put("microphone", stateOf(Manifest.permission.RECORD_AUDIO));
        call.resolve(out);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // No settings screen (rare, e.g. some TV launchers) — fall back to
            // the app-info screen via ACTION_SETTINGS.
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open settings");
            }
        }
    }
}
