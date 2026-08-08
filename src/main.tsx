import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

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

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ConvexAuthProvider client={convex}>
          <BrowserRouter>
            <RouteSyncer />
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
                  <Route path="actions" element={<Actions />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </ConvexAuthProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
