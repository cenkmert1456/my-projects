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
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { AddDropContext } from "./AddDropContext";
import { AddDropSheet } from "@/components/drops/AddDropSheet";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { cn } from "@/lib/utils";
import { useAddDrop } from "./AddDropContext";

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
  const [sheetKind, setSheetKind] = useState<"screenshot" | "image" | "link" | "note" | "document">(
    "screenshot",
  );
  const { user } = useAuth();
  const navigate = useNavigate();

  const openAdd = () => setSheetOpen(true);
  const openAddWithKind = (kind: typeof sheetKind) => {
    setSheetKind(kind);
    setSheetOpen(true);
  };

  return (
    <AddDropContext.Provider
      value={{ open: openAdd, openWithKind: openAddWithKind }}
    >
      <div className="min-h-screen bg-background text-foreground">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/80 bg-sidebar px-3 py-5 lg:flex">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-2 py-1 text-left"
          >
            <Logo />
          </button>

          <div className="mt-6 px-2">
            <Button
              className="w-full gap-2 rounded-2xl py-5 text-[15px] font-semibold shadow-none"
              onClick={openAdd}
            >
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
                <span className="block truncate text-sm font-semibold">
                  {user?.name || "Your memory"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Private by default
                </span>
              </span>
            </button>
            <ThemeToggle />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <Logo />
          </button>
          <div className="flex items-center gap-1">
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

        {/* Main content */}
        <main className="pb-24 lg:pb-10 lg:pl-60">
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
                onClick={openAdd}
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

        <AddDropSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          initialKind={sheetKind}
        />

        {/* The overlay stays mounted while signed in and manages its own
            visibility + exit animation, so AnimatePresence never gets
            unmounted mid-exit (which crashes React with a removeChild error). */}
        {user && <OnboardingOverlay />}
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
