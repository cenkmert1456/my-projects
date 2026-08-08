import type { CapacitorConfig } from "@capacitor/cli";

/**
 * DROP — Capacitor native configuration.
 *
 * The same codebase powers the Web app, Android app and iOS app. This file
 * configures how the native projects (android/ and ios/) load the web build
 * (webDir = dist, produced by `bun run build`).
 *
 * Production apps must NOT depend on a localhost URL — the default Capacitor
 * behaviour (load webDir from the bundle over the https:// scheme) is exactly
 * that. `server.url` is left unset on purpose.
 */
const config: CapacitorConfig = {
  appId: "com.drop.memory",
  appName: "DROP",
  webDir: "dist",

  // Android: serve bundled assets over the https:// scheme so fetch/CORS work
  // like the web. Never point this at localhost for production builds.
  android: {
    allowMixedContent: false,
  },

  ios: {
    contentInset: "always",
    // Required so Supabase auth + signed storage URLs (https) work inside the app.
    limitsNavigationsToAppBoundDomains: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: "#15130f",
      androidSplashResourceName: "splash",
      androidScaleType: "centerCrop",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#15130f",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_drop",
      iconColor: "#e84c1f",
      sound: "default",
    },
    // Secure storage (iOS Keychain / Android Keystore) for tokens & app lock.
    SecureStoragePlugin: {
      // defaults are fine
    },
    CapacitorBiometricAuth: {
      // defaults are fine
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
