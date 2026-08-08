import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "convex/react";
import {
  CalendarClock,
  FolderPlus,
  Heart,
  Inbox,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CATEGORY_META, KIND_META } from "@/lib/drop-meta";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onQuickDrop,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onQuickDrop: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ _id: string; title: string; category: string; kind: string; savedAt: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);
  const searchDrops = useAction(api.search.searchDrops);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const actions: PaletteAction[] = [
    { id: "add", label: "Drop something", hint: "Screenshot, link, note…", icon: Plus, run: () => { onOpenChange(false); } },
    { id: "quick", label: "Quick Drop", hint: "⌘⇧D — save in < 3 seconds", icon: Sparkles, run: onQuickDrop },
    { id: "ask", label: "Ask DROP", hint: "Ask about your memory", icon: Sparkles, run: () => go("/app/ask") },
    { id: "search", label: "Search everything", hint: "Natural language", icon: Search, run: () => go("/app/search") },
    { id: "inbox", label: "Inbox", hint: "New & needs review", icon: Inbox, run: () => go("/app/inbox") },
    { id: "favorites", label: "Favorites", hint: "Starred Drops", icon: Heart, run: () => go("/app/search?starred=1") },
    { id: "upcoming", label: "Upcoming", hint: "Flights, events, deadlines", icon: CalendarClock, run: () => go("/app/upcoming") },
    { id: "places", label: "Places", hint: "Everything you saved by place", icon: MapPin, run: () => go("/app/places") },
    { id: "wishlist", label: "Wishlist", hint: "Products you saved", icon: Heart, run: () => go("/app/wishlist") },
    { id: "actions", label: "Action Center", hint: "Deadlines, reminders, review", icon: Zap, run: () => go("/app/actions") },
    { id: "stacks", label: "Stacks", hint: "Active research groups", icon: Layers, run: () => go("/app/stacks") },
    { id: "collections", label: "Collections", hint: "Long-term categories", icon: FolderPlus, run: () => go("/app/collections") },
    { id: "trash", label: "Trash", hint: "Recover or delete permanently", icon: Trash2, run: () => go("/app/trash") },
    { id: "settings", label: "Settings", hint: "AI, appearance, privacy", icon: Settings, run: () => go("/app/settings") },
  ];

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSelected(0);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchDrops({ query: q, filters: { limit: 6 } });
        setResults((res.results ?? []).map((r) => r.drop));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const list: Array<{ type: "action" | "drop"; id: string; node: React.ReactNode; run: () => void }> = [
    ...actions.map((a) => ({
      type: "action" as const,
      id: a.id,
      node: (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <a.icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{a.label}</span>
            {a.hint && <span className="block truncate text-[11px] text-muted-foreground">{a.hint}</span>}
          </span>
        </div>
      ),
      run: a.run,
    })),
    ...results.map((d) => ({
      type: "drop" as const,
      id: d._id,
      node: (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
            {CATEGORY_META[d.category]?.emoji ?? KIND_META[d.kind]?.emoji ?? "📦"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{d.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {d.category} · {timeAgo(d.savedAt)}
            </span>
          </span>
        </div>
      ),
      run: () => go(`/app/drop/${d._id}`),
    })),
  ];

  const runSelected = () => {
    const item = list[selected];
    if (item) {
      if (item.id === "add") {
        // Close palette + let the shell open the Add sheet.
        onOpenChange(false);
        window.dispatchEvent(new CustomEvent("drop:open-add"));
      } else {
        item.run();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-xl gap-0 overflow-hidden rounded-3xl p-0">
        <DialogTitle className="sr-only">DROP Command</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, list.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runSelected();
              }
            }}
            placeholder="Search your memory or type a command…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">esc</kbd>
        </div>
        <div className="nice-scroll max-h-[46vh] overflow-y-auto p-2">
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim().length < 2 ? "Type to search your Drops…" : "Nothing found yet."}
            </p>
          )}
          {list.map((item, i) => (
            <button
              key={item.type + item.id}
              type="button"
              onMouseEnter={() => setSelected(i)}
              onClick={() => {
                if (item.id === "add") {
                  onOpenChange(false);
                  window.dispatchEvent(new CustomEvent("drop:open-add"));
                } else {
                  item.run();
                }
              }}
              className={cn(
                "flex w-full cursor-pointer items-center rounded-xl px-3 py-2 text-left transition-colors",
                i === selected ? "bg-accent" : "hover:bg-muted/60",
              )}
            >
              {item.node}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border/70 bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-card px-1">↑</kbd><kbd className="rounded border border-border bg-card px-1">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-card px-1">↵</kbd> open</span>
          <span className="ml-auto">Everything you save. Finally searchable.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
