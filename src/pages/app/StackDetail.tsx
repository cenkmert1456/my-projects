import { DropCard } from "@/components/drops/DropCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { dropService, stackService } from "@/lib/services";
import type { Drop } from "@/lib/supabase/database.types";
import { ArrowLeft, Check, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

export default function StackDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { data, loading } = useRealtimeQuery(
    () => stackService.get(uid as string, id as string),
    { table: "stack_drops", userId: uid },
  );
  const { data: allDrops } = useRealtimeQuery(
    () => dropService.listAll(uid as string),
    { table: "drops", userId: uid },
  );
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const members = useMemo(
    () => new Set((data?.drops ?? []).map((d) => d._id)),
    [data],
  );

  const candidates = useMemo(() => {
    if (!allDrops) return [];
    const needle = q.trim().toLowerCase();
    return allDrops
      .filter((d) => !members.has(d._id))
      .filter(
        (d) =>
          !needle ||
          d.title.toLowerCase().includes(needle) ||
          (d.summary ?? "").toLowerCase().includes(needle) ||
          d.category.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [allDrops, members, q]);

  const addOne = async (dropId: string) => {
    setBusyId(dropId);
    try {
      await stackService.addDrop(uid as string, id as string, dropId);
      toast("Added to stack");
    } catch {
      toast("Couldn't add that drop");
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { stack, drops } = data;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/app/stacks")}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Stacks
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted text-3xl">
            {stack.emoji ?? "🗂️"}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{stack.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {drops.length} drop{drops.length !== 1 ? "s" : ""}
              {stack.description ? ` · ${stack.description}` : ""}
            </p>
          </div>
        </div>
        <Button className="gap-2 rounded-2xl font-semibold" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={3} /> Add drops
        </Button>
      </div>

      {drops.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="text-4xl">📥</span>
          <h3 className="mt-4 text-lg font-bold tracking-tight">This stack is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add Drops you're actively researching — screenshots, links and notes
            all fit in a stack.
          </p>
          <Button className="mt-5 gap-2 rounded-2xl" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add drops
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {drops.map((drop: Drop, i) => (
            <div key={drop._id} className="group relative">
              <DropCard drop={drop} index={i} />
              <button
                type="button"
                aria-label="Remove from stack"
                onClick={async () => {
                  await stackService.removeDrop(uid as string, id as string, drop._id);
                }}
                className="absolute right-2 top-2 z-10 rounded-full border border-border/70 bg-background/90 p-1.5 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Add drops to {stack.name}</DialogTitle>
            <DialogDescription>
              Pick from your library — nothing is moved, drops just join the stack.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your Drops…"
              className="pl-9"
            />
          </div>
          <div className="nice-scroll -mx-1 flex-1 space-y-1.5 overflow-y-auto px-1">
            {candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {q ? "No matching Drops" : "Every Drop is already in this stack 🎉"}
              </p>
            ) : (
              candidates.map((d) => (
                <button
                  key={d._id}
                  type="button"
                  onClick={() => void addOne(d._id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm">
                    {d.kind === "screenshot" || d.kind === "image"
                      ? "🖼️"
                      : d.kind === "link"
                        ? "🔗"
                        : d.kind === "note"
                          ? "📝"
                          : "📄"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.title}</span>
                    <span className="block text-xs text-muted-foreground">{d.category}</span>
                  </span>
                  {busyId === d._id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
