import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { AuthCallbackHandler } from "@/components/auth/AuthCallbackHandler";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { ThemeProvider } from "next-themes";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./lib/i18n";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const AppShell = lazy(() => import("./components/app/AppShell.tsx"));
const Home = lazy(() => import("./pages/app/Home.tsx"));
const Search = lazy(() => import("./pages/app/Search.tsx"));
const Inbox = lazy(() => import("./pages/app/Inbox.tsx"));
const Collections = lazy(() => import("./pages/app/Collections.tsx"));
const CollectionDetail = lazy(() => import("./pages/app/CollectionDetail.tsx"));
const Places = lazy(() => import("./pages/app/Places.tsx"));
const Wishlist = lazy(() => import("./pages/app/Wishlist.tsx"));
const Upcoming = lazy(() => import("./pages/app/Upcoming.tsx"));
const AskDrop = lazy(() => import("./pages/app/AskDrop.tsx"));
const DropDetail = lazy(() => import("./pages/app/DropDetail.tsx"));
const Profile = lazy(() => import("./pages/app/Profile.tsx"));
const Stacks = lazy(() => import("./pages/app/Stacks.tsx"));
const StackDetail = lazy(() => import("./pages/app/StackDetail.tsx"));
const Trash = lazy(() => import("./pages/app/Trash.tsx"));
const Settings = lazy(() => import("./pages/app/Settings.tsx"));
const Permissions = lazy(() => import("./pages/app/Permissions.tsx"));
const Actions = lazy(() => import("./pages/app/Actions.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/**
 * Production-safe error boundary.
 *
 * Never shows developer/preview text. A runtime error is logged and the user
 * sees a minimal brand fallback with a working "reload" action — the app is
 * never a blank page, and no preview/debug overlay ships to end users.
 */
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.error("[DROP] Runtime error caught:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--background)",
            color: "var(--foreground)",
            padding: 24,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <div
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 16px",
                borderRadius: 16,
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              D
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
              Something went wrong
            </p>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "0 0 16px" }}>
              Your memory is safe. Please reopen DROP.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 20px",
                borderRadius: 12,
                border: "none",
                background: "var(--primary)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();

  // Dismiss the inline HTML boot splash as soon as React has mounted: fade it
  // out (never a hard cut, never a white frame) and remove it after the
  // transition so the native splash → HTML splash → React chain stays dark
  // and continuous. Never blocks startup — it is removed on first mount.
  useEffect(() => {
    const el = document.getElementById("boot-splash");
    if (!el) return;
    el.classList.add("hide");
    const t = window.setTimeout(() => el.remove(), 350);
    return () => window.clearTimeout(t);
  }, []);

  // Keep the document title in sync with the active screen.
  useEffect(() => {
    document.title = "DROP — Everything you save. Finally searchable.";
  }, [location.pathname]);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <AuthProvider>
          <BrowserRouter>
            <RouteSyncer />
            <AuthCallbackHandler />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/auth"
                  element={<AuthPage redirectAfterAuth="/app" />}
                />
                <Route
                  path="/app"
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Home />} />
                  <Route path="search" element={<Search />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="collections" element={<Collections />} />
                  <Route path="collections/:id" element={<CollectionDetail />} />
                  <Route path="places" element={<Places />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="upcoming" element={<Upcoming />} />
                  <Route path="ask" element={<AskDrop />} />
                  <Route path="drop/:id" element={<DropDetail />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="stacks" element={<Stacks />} />
                  <Route path="stacks/:id" element={<StackDetail />} />
                  <Route path="trash" element={<Trash />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="permissions" element={<Permissions />} />
                  <Route path="actions" element={<Actions />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
