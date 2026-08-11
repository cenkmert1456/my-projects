package com.drop.memory;

import android.Manifest;
import android.content.Context;
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
 * microphone state, reliably distinguishing "never asked" from "don't ask
 * again" (permanently denied), or deep-linking into Android's app settings.
 * This tiny plugin fills those gaps with the real OS state — it never
 * fabricates a "granted".
 *
 *   getStatuses()        → camera / microphone / notifications states
 *   requestPermission()  → runtime-request CAMERA / RECORD_AUDIO through the
 *                          real Android permission API
 *   openAppSettings()    → ACTION_APPLICATION_DETAILS_SETTINGS
 *
 * Android provides no API that separates "never asked" from "permanently
 * denied" — both make shouldShowRequestPermissionRationale() return false.
 * DROP tracks which permissions a request was actually made for (persisted in
 * SharedPreferences), so a fresh install reports "denied" (still requestable)
 * until the user genuinely denies with "don't ask again".
 *
 * Photos & documents deliberately have NO permission here: DROP selects them
 * through the Android system Photo Picker / Storage Access Framework, which
 * require no broad storage permission.
 */
@CapacitorPlugin(
    name = "DropPermissions",
    permissions = {
        @com.getcapacitor.annotation.Permission(
            alias = "camera",
            strings = {Manifest.permission.CAMERA}
        ),
        @com.getcapacitor.annotation.Permission(
            alias = "microphone",
            strings = {Manifest.permission.RECORD_AUDIO}
        )
    }
)
public class DropPermissionsPlugin extends Plugin {

    private static final String PREFS = "drop_permissions";
    private static final String KEY_REQUESTED = "requested_";

    private boolean wasRequested(String permission) {
        return getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_REQUESTED + permission, false);
    }

    private void markRequested(String permission) {
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REQUESTED + permission, true)
            .apply();
    }

    /** Resolve a runtime permission into granted / denied / permanently denied. */
    private String stateOf(String permission) {
        if (Build.VERSION.SDK_INT < 23) return "granted";
        int check = ContextCompat.checkSelfPermission(getContext(), permission);
        if (check == PackageManager.PERMISSION_GRANTED) return "granted";
        // shouldShowRequestPermissionRationale() == true → denied once but the
        // system will still show the dialog again → plain "denied".
        if (getActivity().shouldShowRequestPermissionRationale(permission)) {
            return "denied";
        }
        // false here means EITHER never asked OR "don't ask again". Only call
        // it permanently denied when a request genuinely happened before.
        return wasRequested(permission) ? "permanently_denied" : "denied";
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
        out.put("photosMode", "photo_picker");
        call.resolve(out);
    }

    /**
     * Request a runtime permission through the real Android API.
     * Supported kinds: "camera", "microphone". The request is marked before
     * the system dialog opens so the follow-up state can detect permanent
     * denial; the callback resolves with the post-request state.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String kind = call.getString("kind", "microphone");
        switch (kind) {
            case "camera":
                markRequested(Manifest.permission.CAMERA);
                requestPermissionForAlias("camera", call, "permissionResult");
                break;
            case "microphone":
                markRequested(Manifest.permission.RECORD_AUDIO);
                requestPermissionForAlias("microphone", call, "permissionResult");
                break;
            default:
                call.reject("Unsupported permission kind: " + kind);
        }
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject out = new JSObject();
        out.put("camera", stateOf(Manifest.permission.CAMERA));
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
