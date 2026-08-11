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

  // The launch splash is implemented natively with the AndroidX SplashScreen
  // theme (see android/app/src/main/res/values/styles.xml) — the deprecated
  // @capacitor/splash-screen JS plugin is intentionally NOT configured, so no
  // old splash PNG is referenced and startup never waits on JS.
  plugins: {
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
