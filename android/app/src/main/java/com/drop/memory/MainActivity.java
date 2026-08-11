package com.drop.memory;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install the AndroidX SplashScreen (Android 12+ system splash with a
        // compat fallback on older versions) BEFORE the Capacitor bridge is
        // created. The splash holds until the WebView draws its first frame,
        // so the app never flashes white or shows an empty WebView while the
        // bundled app is loading.
        SplashScreen.install(this);
        // Register DROP's app-local native plugins. DropPermissions provides
        // real runtime permission state (incl. permanently-denied detection),
        // the RECORD_AUDIO request path, and the "Open Settings" deep link;
        // DropPhotoPicker opens the system Photo Picker (API 33+) or the
        // permissionless ACTION_GET_CONTENT gallery (older) with no storage
        // permission; IncomingShare handles ACTION_SEND share intents. Without
        // these registerPlugin calls the plugins are never reachable from JS.
        registerPlugin(DropPermissionsPlugin.class);
        registerPlugin(DropPhotoPickerPlugin.class);
        registerPlugin(IncomingSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
