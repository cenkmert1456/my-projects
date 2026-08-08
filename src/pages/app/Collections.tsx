import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { collectionService, dropService } from "@/lib/services";
import type { Drop } from "@/lib/supabase/database.types";
import { FolderHeart, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Collections() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { data: collections, loading } = useRealtimeQuery(
    () => collectionService.list(uid as string),
    { table: "collections", userId: uid },
  );
  const { data: allDrops } = useRealtimeQuery(
    () => dropService.listAll(uid as string),
    { table: "drops", userId: uid },
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const navigate = useNavigate();

  const magic = useMemo(() => {
    if (!allDrops) return [];
    const now = Date.now();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const inItaly = (d: Drop) =>
      d.place?.country === "Italy" ||
      d.entities.some((e) => e.type === "place" && e.metadata?.country === "Italy");
    const future = (d: Drop) =>
      (d.event?.startTime && d.event.startTime > now) ||
      (d.reservation?.startTime && d.reservation.startTime > now);
    return [
      { id: "under100", name: "Under €100", emoji: "🪙", drops: allDrops.filter((d) => (d.product?.price ?? Infinity) < 100) },
      { id: "italy", name: "Italy", emoji: "🇮🇹", drops: allDrops.filter(inItaly) },
      { id: "thismonth", name: "This Month", emoji: "🗓️", drops: allDrops.filter((d) => d.savedAt >= startOfMonth) },
      { id: "upcoming", name: "Upcoming", emoji: "⏰", drops: allDrops.filter(future) },
      { id: "favorites", name: "Favorites", emoji: "⭐", drops: allDrops.filter((d) => d.starred) },
      { id: "screenshots", name: "Screenshots", emoji: "📸", drops: allDrops.filter((d) => d.kind === "screenshot" || d.kind === "image") },
    ].filter((m) => m.drops.length > 0);
  }, [allDrops]);

  const handleCreate = async () => {
    if (!name.trim() || !uid) return;
    const created = await collectionService.create(uid, { name: name.trim(), emoji });
    setCreating(false);
    setName("");
    toast("Collection created");
    navigate(`/app/collections/${created.id}`);
  };

  if (loading || !collections || !allDrops) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            DROP builds some for you automatically. The rest is up to you.
          </p>
        </div>
        <Button
          className="gap-2 rounded-2xl font-semibold"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          New
        </Button>
      </div>

      {magic.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto collections
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {magic.map((m) => (
              <MagicCard key={m.id} m={m} onClick={() => navigate(`/app/search?${toMagicQuery(m.id)}`)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Your collections
        </h2>
        {collections.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <FolderHeart className="h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-bold tracking-tight">No collections yet</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Group drops by trip, project, mood — or let DROP's auto collections do it.
            </p>
            <Button className="mt-4 gap-2 rounded-2xl" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create one
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {collections.map((c) => (
              <div
                key={c._id}
                className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/30"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/app/collections/${c._id}`)}
                  className="w-full cursor-pointer text-left"
                >
                  <span className="text-3xl">{c.emoji ?? "📁"}</span>
                  <p className="mt-3 truncate font-bold tracking-tight">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.dropCount} drop{c.dropCount !== 1 ? "s" : ""}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={async () => {
                    await collectionService.remove(uid as string, c._id);
                    toast("Collection deleted");
                  }}
                  className="absolute right-2.5 top-2.5 cursor-pointer rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">New collection</DialogTitle>
            <DialogDescription>
              A Drop can live in as many collections as you like.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo Trip"
              onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            />
            <div className="flex flex-wrap gap-1.5">
              {["📁", "✈️", "🍝", "👟", "🎬", "💡", "🛒", "🏠", "❤️", "💼"].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={
                    emoji === e
                      ? "cursor-pointer rounded-lg bg-primary/15 p-2 text-lg ring-2 ring-primary"
                      : "cursor-pointer rounded-lg p-2 text-lg hover:bg-muted"
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toMagicQuery(id: string): string {
  const map: Record<string, string> = {
    under100: "q=products+under+100",
    italy: "q=italy",
    thismonth: "q=this+month",
    upcoming: "q=upcoming",
    favorites: "q=favorites",
    screenshots: "q=screenshots",
  };
  return map[id] ?? "";
}

function MagicCard({
  m,
  onClick,
}: {
  m: { name: string; emoji: string; drops: Drop[] };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-2xl border border-primary/20 bg-gradient-to-br from-accent/60 via-card to-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <span className="text-3xl">{m.emoji}</span>
      <p className="mt-3 font-bold tracking-tight">{m.name}</p>
      <p className="text-xs text-muted-foreground">{m.drops.length} drops · auto</p>
    </button>
  );
}
