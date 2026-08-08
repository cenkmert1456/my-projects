package com.drop.memory;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * IncomingShare — receives Android "Share to DROP" intents.
 *
 * Instagram / TikTok / Safari / Chrome / Photos / Files → Share → DROP:
 * the OS hands us an ACTION_SEND (or ACTION_SEND_MULTIPLE) intent carrying
 * text, a URL and/or content:// URIs.
 *
 * We resolve the shared file to a base64 data URL right here in native code
 * (WebViews cannot fetch content:// URIs), cache the payload, and notify the
 * web layer — which shows the DROP capture preview and only uploads after the
 * user confirms.
 *
 * Two delivery paths:
 *   - Warm start:  handleOnNewIntent fires a `drop:incoming-share` DOM event.
 *   - Cold start:  the payload is cached; the web layer polls getPendingShare()
 *                  on startup to pick it up.
 */
@CapacitorPlugin(name = "IncomingShare")
public class IncomingSharePlugin extends Plugin {

    private JSObject pending = null;

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        if (pending != null) {
            call.resolve(pending);
            pending = null;
        } else {
            call.resolve(new JSObject());
        }
    }

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        Intent intent = getActivity().getIntent();
        if (intent != null && isShareIntent(intent)) {
            deliver(parse(intent));
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && isShareIntent(intent)) {
            deliver(parse(intent));
        }
    }

    private boolean isShareIntent(Intent intent) {
        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    private JSObject parse(Intent intent) {
        JSObject payload = new JSObject();
        String type = intent.getType();
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (type != null) payload.put("type", type);
        if (text != null) payload.put("text", text);
        if (subject != null && subject != null && !subject.equals(text)) {
            payload.put("subject", subject);
        }

        JSArray dataUrls = new JSArray();
        ArrayList<Uri> streams = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) streams.add(stream);
        } else {
            ArrayList<Uri> extra = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (extra != null) streams.addAll(extra);
        }
        for (Uri uri : streams) {
            String dataUrl = readAsDataUrl(uri);
            if (dataUrl != null) dataUrls.put(dataUrl);
        }
        if (dataUrls.length() > 0) payload.put("dataUrls", dataUrls);
        return payload;
    }

    /** Read a content:// URI into a base64 data URL (cap ~8 MB for preview). */
    private String readAsDataUrl(Uri uri) {
        try {
            InputStream in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            long total = 0;
            long cap = 8L * 1024 * 1024;
            while ((n = in.read(buf)) != -1 && total < cap) {
                out.write(buf, 0, n);
                total += n;
            }
            in.close();
            byte[] bytes = out.toByteArray();
            String mime = getContext().getContentResolver().getType(uri);
            if (mime == null) mime = "application/octet-stream";
            return "data:" + mime + ";base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    private void deliver(JSObject payload) {
        pending = payload;
        String js = "window.dispatchEvent(new CustomEvent('drop:incoming-share', { detail: "
                + payload.toString() + " }));";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }
}
