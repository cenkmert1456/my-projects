import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Supabase env validation.
 *
 * DROP must never ship an APK pointed at a placeholder / localhost backend.
 * `vite build` (production) FAILS with a clear message when the Supabase keys
 * are missing or invalid; the dev server only warns so the preview keeps
 * working while keys are being configured.
 */
function supabaseEnvCheck(command: "build" | "serve", env: Record<string, string>): Plugin {
  const url = (env.VITE_SUPABASE_URL ?? "").trim();
  const key =
    (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "").trim();

  const problems: string[] = [];
  if (!url || url.includes("placeholder")) {
    problems.push("VITE_SUPABASE_URL is missing (set it in your project's Keys/API keys tab)");
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push(`VITE_SUPABASE_URL "${url}" is not a valid URL`);
    }
    if (parsed) {
      if (parsed.protocol !== "https:") problems.push(`VITE_SUPABASE_URL must be HTTPS (got "${parsed.protocol}")`);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        problems.push("VITE_SUPABASE_URL must not point at localhost");
      }
    }
  }
  if (!key || key.includes("placeholder")) {
    problems.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing (set it in your project's Keys/API keys tab)");
  }

  const message =
    problems.length > 0
      ? [
          "DROP backend is not configured for production.",
          "",
          ...problems.map((p) => `  - ${p}`),
          "",
          "Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the public",
          "anon/publishable key — never the service-role key) in the Keys/API keys",
          "tab, then rebuild. The legacy VITE_SUPABASE_ANON_KEY name also works.",
        ].join("\n")
      : "";

  return {
    name: "drop-supabase-env-check",
    enforce: "pre",
    configResolved(config) {
      if (!message) return;
      if (command === "build") {
        config.logger.error(message);
        throw new Error("DROP build aborted: Supabase environment not configured.");
      }
      config.logger.warn("[DROP] " + message.replace(/\n/g, "\n[DROP] "));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // Relative asset base: the built index.html is served from inside the
    // Capacitor bundle (https://localhost over the WebView asset loader), so
    // every script/style path must resolve relative to the document — never
    // absolute. This is the Capacitor-recommended Vite setting.
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      supabaseEnvCheck(command, env),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      // Force a single copy of React across all packages so no duplicate
      // React bundles can ever resolve (prevents "Invalid hook call" errors).
      dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
    },
    build: {
      // Enable source maps for better debugging (disable in production if needed)
      sourcemap: false,
      // Optimize chunk splitting
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching and lazy loading
          manualChunks: {
            // Vendor chunks for large libraries
            'react-vendor': ['react', 'react-dom', 'react-router'],
            // Large UI library chunks
            'radix-ui': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-avatar',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-collapsible',
              '@radix-ui/react-context-menu',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-hover-card',
              '@radix-ui/react-label',
              '@radix-ui/react-menubar',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-select',
              '@radix-ui/react-separator',
              '@radix-ui/react-slider',
              '@radix-ui/react-switch',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toggle',
              '@radix-ui/react-toggle-group',
              '@radix-ui/react-tooltip',
            ],
            // Heavy optional libraries - separate chunks for better lazy loading
            'framer-motion': ['framer-motion'],
            'charts': ['recharts'],
            'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          },
          // Optimize chunk size
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Increase chunk size warning limit for better chunking
      chunkSizeWarningLimit: 1000,
      // Target modern browsers for better optimization
      target: 'esnext',
      // Minify options - using esbuild (faster than terser)
      minify: 'esbuild',
    },
    // Optimize dependencies
    optimizeDeps: {
      // Only scan the app entry HTML; avoids crawling unrelated *.html files
      // if a legacy snapshot accidentally contains leaked package folders.
      entries: ['index.html'],
      include: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'react-router',
        'framer-motion',
      ],
    },
    // Performance hints
    server: {
      // Bind to all interfaces so WebContainer's server-ready event fires.
      host: true,
      port: 5173,
      // HMR must stay disabled: the platform syncs file changes to the dev
      // server, and hot updates corrupt the browser's module graph, causing
      // "Failed to fetch dynamically imported module" runtime errors. Full
      // page reloads pick up changes reliably.
      hmr: false,
    },
  };
});
