import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Home,
  Search,
  Inbox,
  FolderHeart,
  MapPin,
  Heart,
  CalendarClock,
  Sparkles,
  User,
  Plus,
  Moon,
  Sun,
  Layers,
  Settings,
  Trash2,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { AddDropContext, type SharePayload } from "./AddDropContext";
import { AddDropSheet, type DropKindOption } from "@/components/drops/AddDropSheet";
import { MobileCaptureSheet } from "@/components/drops/MobileCaptureSheet";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { CommandPalette } from "./CommandPalette";
import { QuickDrop } from "./QuickDrop";
import { AppLockOverlay } from "./AppLockOverlay";
import DropIntelligenceOverlay from "./DropIntelligenceOverlay";
import { cn } from "@/lib/utils";
import { useAddDrop } from "./AddDropContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileApp } from "@/hooks/use-mobile-app";
import { haptic, isNative } from "@/lib/mobile/native";
import { appLockEnabled } from "@/lib/mobile/app-lock";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";

const NAV = [
  { to: "/app", label: "Home", icon: Home, end: true },
  { to: "/app/search", label: "Search", icon: Search },
  { to: "/app/inbox", label: "Inbox", icon: Inbox },
  { to: "/app/collections", label: "Collections", icon: FolderHeart },
  { to: "/app/places", label: "Places", icon: MapPin },
  { to: "/app/wishlist", label: "Wishlist", icon: Heart },
  { to: "/app/upcoming", label: "Upcoming", icon: CalendarClock },
  { to: "/app/ask", label: "Ask DROP", icon: Sparkles },
];

const MORE_NAV = [
  { to: "/app/actions", label: "Action Center", icon: Sparkles },
  { to: "/app/stacks", label: "Stacks", icon: Layers },
  { to: "/app/trash", label: "Trash", icon: Trash2 },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </Button>
  );
}

export default function AppShell() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKind, setSheetKind] = useState<DropKindOption>("screenshot");
  const [mobileCaptureOpen, setMobileCaptureOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const generateUploadUrl = useMutation(api.drops.generateUploadUrl);
  const create = useMutation(api.drops.create);

  const { online, locked, setLocked, requestUnlock } = useMobileApp();

  const openAdd = () => {
    if (isMobile) {
      setSharePayload(null);
      setMobileCaptureOpen(true);
    } else {
      setSheetOpen(true);
    }
  };
  const openAddWithKind = (kind: DropKindOption) => {
    if (isMobile) {
      setSharePayload(null);
      setMobileCaptureOpen(true);
    } else {
      setSheetKind(kind);
      setSheetOpen(true);
    }
  };

  // Incoming share (Android intent / cold start): open the capture preview.
  useEffect(() => {
    const onIncoming = (e: Event) => {
      const detail = (e as CustomEvent<SharePayload>).detail;
      if (!detail) return;
      if (isMobile || isNative()) {
        setSharePayload(detail);
        setMobileCaptureOpen(true);
      } else {
        // Web fallback: pre-fill the desktop sheet.
        if (detail.url) {
          setSheetKind("link");
          setSheetOpen(true);
        } else if (detail.text) {
          setSheetKind("note");
          setSheetOpen(true);
        }
      }
    };
    window.addEventListener("drop:open-incoming-share", onIncoming);
    return () => window.removeEventListener("drop:open-incoming-share", onIncoming);
  }, [isMobile]);

  // Keyboard shortcuts: ⌘K command palette, ⌘⇧D quick drop, "/" search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setQuickOpen((o) => !o);
        return;
      }
      if (e.key === "/") {
        const el = document.activeElement;
        const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
        if (!typing) {
          e.preventDefault();
          navigate("/app/search");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Command palette's "Drop something" action.
  useEffect(() => {
    const open = () => openAdd();
    window.addEventListener("drop:open-add", open);
    return () => window.removeEventListener("drop:open-add", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Global drag & drop: drop files anywhere to capture them.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length || !user) return;
      try {
        for (const file of files) {
          const storageUrl = await generateUploadUrl();
          const res = await fetch(storageUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!res.ok) throw new Error("Upload failed");
          const storageId = storageUrl.split("/").pop() ?? "";
          const kind = /pdf|word|text/i.test(file.type) ? "document" : file.type.startsWith("image/") ? "image" : "document";
          const result = await create({ kind, storageId, contentType: file.type, fileName: file.name });
          if (result.duplicate) {
            toast("You already saved this", { description: `“${result.title ?? "item"}” is already in your memory.` });
          }
        }
        haptic("success");
        toast(files.length > 1 ? `Dropped ${files.length} items ✓` : "Dropped ✓", {
          description: "Saved instantly. DROP is understanding it now…",
        });
      } catch {
        toast("Couldn't upload", { description: "Your files are safe — try the + button instead." });
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [user, generateUploadUrl, create]);

  return (
    <AddDropContext.Provider value={{ open: openAdd, openWithKind: openAddWithKind, openWithShare: (p) => { setSharePayload(p); if (isMobile || isNative()) setMobileCaptureOpen(true); } }}>
      <div className="min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/80 bg-sidebar px-3 py-5 lg:flex">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2 px-2 py-1 text-left">
            <Logo />
          </button>

          <div className="mt-6 px-2">
            <Button className="w-full gap-2 rounded-2xl py-5 text-[15px] font-semibold shadow-none" onClick={() => { haptic("light"); openAdd(); }}>
              <Plus className="h-4 w-4" strokeWidth={3} />
              Drop Something
            </Button>
          </div>

          <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                    isActive && "bg-sidebar-accent text-foreground",
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}

            <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              More
            </p>
            {MORE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                    isActive && "bg-sidebar-accent text-foreground",
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/app/settings"
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  isActive && "bg-sidebar-accent text-foreground",
                )
              }
            >
              <Settings className="h-[18px] w-[18px]" />
              Settings
            </NavLink>
          </nav>

          <div className="mt-4 flex items-center justify-between border-t border-border/70 px-3 pt-4">
            <button
              type="button"
              onClick={() => navigate("/app/profile")}
              className="flex min-w-0 items-center gap-2.5 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {(user?.name ?? user?.email ?? "D")[0]?.toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{user?.name || "Your memory"}</span>
                <span className="block text-[11px] text-muted-foreground">Private by default</span>
              </span>
            </button>
            <ThemeToggle />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/85 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md lg:hidden">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2">
            <Logo />
          </button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setCmdOpen(true)} aria-label="Command menu">
              <Search className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => navigate("/app/profile")}
              aria-label="Profile"
            >
              <User className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Offline banner */}
        {!online && (
          <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-700 backdrop-blur-md dark:text-amber-300 lg:top-0">
            <WifiOff className="h-3.5 w-3.5" />
            You're offline — new Drops will be queued and saved automatically when you're back online.
          </div>
        )}

        {/* Main content */}
        <main className={cn("pb-24 lg:pb-10 lg:pl-60", online ? "" : "pt-0")}>
          <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6 lg:px-10">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 py-1.5">
            <MobileNavItem to="/app" label="Home" icon={Home} end />
            <MobileNavItem to="/app/search" label="Search" icon={Search} />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => { haptic("light"); openAdd(); }}
                aria-label="Drop something"
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                <Plus className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
            <MobileNavItem to="/app/collections" label="Saved" icon={FolderHeart} />
            <MobileNavItem to="/app/profile" label="You" icon={User} />
          </div>
        </nav>

        {/* Global drag overlay */}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-primary/60 bg-card/90 px-12 py-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <UploadCloud className="h-7 w-7" />
              </div>
              <p className="text-lg font-bold tracking-tight">Drop it into DROP</p>
              <p className="text-sm text-muted-foreground">Release to save it instantly</p>
            </div>
          </div>
        )}

        <AddDropSheet open={sheetOpen} onOpenChange={setSheetOpen} initialKind={sheetKind} />

        {/* Mobile-native capture sheet */}
        <MobileCaptureSheet
          open={mobileCaptureOpen}
          onOpenChange={setMobileCaptureOpen}
          share={sharePayload}
          onOpenAdvanced={(kind) => {
            setSheetKind(kind);
            setSheetOpen(true);
          }}
        />

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} onQuickDrop={() => setQuickOpen(true)} />
        <QuickDrop open={quickOpen} onOpenChange={setQuickOpen} />

        {/* The overlay stays mounted while signed in and manages its own
            visibility + exit animation, so AnimatePresence never gets
            unmounted mid-exit (which crashes React with a removeChild error). */}
        {user && <OnboardingOverlay />}

        {/* First-launch DROP Intelligence provisioning (native only) */}
        <DropIntelligenceOverlay />

        {/* Biometric app lock */}
        {locked && (
          <AppLockOverlay
            onUnlock={async () => {
              const ok = await requestUnlock();
              if (!ok) {
                toast("Couldn't verify identity", { description: "Try again, or sign back in." });
              }
            }}
            onFallback={() => {
              setLocked(false);
              void signOut().then(() => navigate("/auth?returnTo=%2Fapp"));
            }}
          />
        )}
      </div>
    </AddDropContext.Provider>
  );
}

function MobileNavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground transition-colors",
          isActive && "text-primary",
        )
      }
    >
      <Icon className="h-[22px] w-[22px]" />
      {label}
    </NavLink>
  );
}
