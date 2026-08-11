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
        registerPlugin(IncomingSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
