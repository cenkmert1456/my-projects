package com.drop.memory;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultContracts;
import androidx.activity.result.PickVisualMediaRequest;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * DropPhotoPicker — the app's own gallery picker for Android.
 *
 * Picking photos must NOT require any storage/media permission. This plugin
 * opens:
 *
 *   - Android 13+ (API 33): the system Photo Picker via
 *     ActivityResultContracts.PickVisualMedia / PickMultipleVisualMedia.
 *   - Older Android: the classic permissionless ACTION_GET_CONTENT flow with
 *     CATEGORY_OPENABLE (the same intent every Android photo app supports).
 *
 * The picked content:// URIs are read here in native code (a WebView cannot
 * fetch content:// URIs without URI grants) and returned to the web layer as
 * base64 data URLs, so the JS side never touches storage permissions either.
 *
 * Cancellation is NOT an error: it resolves with an empty "photos" array.
 * A genuine failure rejects with the real exception message so the JS layer
 * can log it in development and fall back to another picker implementation.
 */
@CapacitorPlugin(name = "DropPhotoPicker")
public class DropPhotoPickerPlugin extends Plugin {

    /** 25 MB read cap — enough for any photo, prevents OOM on huge captures. */
    private static final long MAX_BYTES = 25L * 1024 * 1024;

    @PluginMethod
    public void pick(PluginCall call) {
        boolean multiple = call.getBoolean("multiple", false);
        int limit = call.getInt("limit", multiple ? 0 : 1);
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+: the real system Photo Picker — no permission.
                PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                    .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                    .build();
                if (multiple) {
                    if (limit > 1) {
                        int max = Math.min(limit, MediaStore.getPickImagesMaxLimit());
                        intent = new ActivityResultContracts.PickMultipleVisualMedia(max).createIntent(getContext(), request);
                    } else {
                        intent = new ActivityResultContracts.PickMultipleVisualMedia().createIntent(getContext(), request);
                    }
                } else {
                    intent = new ActivityResultContracts.PickVisualMedia().createIntent(getContext(), request);
                }
            } else {
                // Older Android: permissionless document/gallery picker.
                intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("image/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            startActivityForResult(call, intent, "pickResult");
        } catch (Exception ex) {
            call.reject("DropPhotoPicker unavailable: " + ex.getMessage());
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        try {
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                // Cancelled — NOT an error.
                JSObject out = new JSObject();
                out.put("photos", new JSArray());
                call.resolve(out);
                return;
            }
            ArrayList<Uri> uris = new ArrayList<>();
            Intent data = result.getData();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri u = data.getClipData().getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            JSArray photos = new JSArray();
            for (Uri uri : uris) {
                JSObject photo = readPhoto(uri);
                if (photo != null) photos.put(photo);
            }
            JSObject out = new JSObject();
            out.put("photos", photos);
            call.resolve(out);
        } catch (Exception ex) {
            call.reject("Failed to read picked photos: " + ex.getMessage());
        }
    }

    /** Read a content:// URI into a base64 data URL. Returns null when unreadable. */
    private JSObject readPhoto(Uri uri) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            String mime = resolver.getType(uri);
            if (mime == null) mime = "image/jpeg";
            String displayName = null;
            long size = 0;
            try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int sizeIdx = c.getColumnIndex(OpenableColumns.SIZE);
                    if (nameIdx >= 0 && !c.isNull(nameIdx)) displayName = c.getString(nameIdx);
                    if (sizeIdx >= 0 && !c.isNull(sizeIdx)) size = c.getLong(sizeIdx);
                }
            } catch (Exception ignored) {
                // cursor query is best-effort
            }
            InputStream in = resolver.openInputStream(uri);
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            long total = 0;
            while ((n = in.read(buf)) != -1 && total < MAX_BYTES) {
                out.write(buf, 0, n);
                total += n;
            }
            in.close();
            byte[] bytes = out.toByteArray();
            JSObject photo = new JSObject();
            photo.put("dataUrl", "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            photo.put("mimeType", mime);
            photo.put("size", size > 0 ? size : bytes.length);
            if (displayName != null) photo.put("displayName", displayName);
            return photo;
        } catch (Exception ex) {
            return null;
        }
    }
}
