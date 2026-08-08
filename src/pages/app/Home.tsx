import { AddDropContext } from "@/components/app/AddDropContext";
import { DropCard } from "@/components/drops/DropCard";
import { SearchBar } from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { dropService } from "@/lib/services";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Camera,
  FileUp,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { useContext, useMemo } from "react";
import { useNavigate } from "react-router";
import { greeting } from "@/lib/format";

const QUICK_ACTIONS = [
  { kind: "screenshot", label: "Screenshot", icon: Camera },
  { kind: "image", label: "Photo", icon: ImagePlus },
  { kind: "link", label: "Link", icon: Link2 },
  { kind: "note", label: "Note", icon: StickyNote },
  { kind: "document", label: "Document", icon: FileUp },
] as const;

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open: openAdd, openWithKind } = useContext(AddDropContext);
  const userId = user?.id;
  const recent = useRealtimeQuery(
    () => (userId ? dropService.listRecent(userId, 12) : Promise.resolve([])),
    { table: "drops", userId },
  );
  const upcoming = useRealtimeQuery(
    () => (userId ? dropService.upcoming(userId) : Promise.resolve([])),
    { table: "drops", userId },
  );
  const allDrops = useRealtimeQuery(
    () => (userId ? dropService.listAll(userId) : Promise.resolve([])),
    { table: "drops", userId },
  );

  const forYou = useMemo(() => {
    const data = allDrops.data ?? [];
    if (data.length < 3) return [];
    // Surface older, high-value items the user may have forgotten.
    return data
      .filter((d) => d.status === "ready")
      .filter((d) => !d.starred && !d.archived)
      .sort((a, b) => a.savedAt - b.savedAt)
      .slice(0, 3);
  }, [allDrops.data]);

  if (!recent.data || !upcoming.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const firstName = (user?.name ?? user?.email ?? "friend").split(/[\s@]/)[0];

  return (
    <div className="space-y-7 lg:space-y-8">
      {/* Greeting — large, touch-first on mobile */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {greeting()}, {firstName}.
          </p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl">
            Search your memory
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground sm:hidden">
            Everything you saved. Finally findable.
          </p>
        </div>
        <Button
          onClick={openAdd}
          className="hidden shrink-0 gap-2 rounded-2xl px-5 font-semibold sm:flex"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          Drop Something
        </Button>
      </div>

      {/* Search — big target on mobile */}
      <SearchBar className="max-w-2xl" />

      {/* Quick actions */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => openWithKind?.(action.kind)}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm font-medium transition-all hover:border-primary/40 hover:bg-accent/50 active:scale-[0.98]"
          >
            <action.icon className="h-4 w-4 text-primary" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Upcoming strip */}
      {upcoming.data.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <CalendarClock className="h-4 w-4 text-primary" /> Upcoming
            </h2>
            <button
              type="button"
              onClick={() => navigate("/app/upcoming")}
              className="text-sm font-medium text-primary hover:underline"
            >
              See all
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {upcoming.data.slice(0, 6).map((drop) => (
              <motion.button
                key={drop._id}
                type="button"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => navigate(`/app/drop/${drop._id}`)}
                className="flex min-w-56 cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left transition-all hover:border-primary/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-lg">
                  {drop.event ? "🎟️" : "✈️"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{drop.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {drop.event?.startTime
                      ? new Date(drop.event.startTime).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Saved"}
                  </span>
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Recent drops */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">Recent Drops</h2>
          <button
            type="button"
            onClick={() => navigate("/app/inbox")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Inbox →
          </button>
        </div>
        {recent.data.length === 0 ? (
          <EmptyHome onAdd={openAdd} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {recent.data.map((drop, i) => (
              <DropCard key={drop._id} drop={drop} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* For you — daily recall */}
      {forYou.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Sparkles className="h-4 w-4 text-primary" /> From your Drops
            </h2>
          </div>
          <div className="space-y-2.5">
            {forYou.map((drop) => (
              <button
                key={drop._id}
                type="button"
                onClick={() => navigate(`/app/drop/${drop._id}`)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 text-left transition-all hover:border-primary/30"
              >
                <span className="text-xl">{drop.storageId ? "🖼️" : "💭"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{drop.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    You saved this{" "}
                    {Math.max(1, Math.floor((Date.now() - drop.savedAt) / 86400000))} day
                    {Math.max(1, Math.floor((Date.now() - drop.savedAt) / 86400000)) > 1 ? "s" : ""}{" "}
                    ago
                    {drop.product?.price !== undefined
                      ? ` — still at ${drop.product.price} ${drop.product.currency ?? ""}`
                      : ""}
                  </span>
                </span>
                <span className="text-muted-foreground">→</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyHome({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Plus className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-tight">Nothing saved yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Drop a screenshot, a link, a product, a place — DROP understands it and
        you'll find it with a plain sentence later.
      </p>
      <Button onClick={onAdd} className="mt-5 gap-2 rounded-2xl font-semibold">
        <Plus className="h-4 w-4" strokeWidth={3} />
        Drop Something
      </Button>
    </div>
  );
}
