import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQuery } from "convex/react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { timeAgo } from "@/lib/format";

const TRASH_DAYS = 30;

export default function Trash() {
  const trash = useQuery(api.drops.trash);
  const restore = useMutation(api.drops.restore);
  const deletePermanently = useMutation(api.drops.deletePermanently);
  const emptyTrash = useMutation(api.drops.emptyTrash);
  const navigate = useNavigate();
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!trash) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const emptyCount = trash.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trash2 className="h-6 w-6 text-primary" /> Trash
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drops stay here for {TRASH_DAYS} days before permanent deletion.
          </p>
        </div>
        {emptyCount > 0 && (
          <Button
            variant="outline"
            className="gap-2 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setEmptyOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Empty trash
          </Button>
        )}
      </div>

      {emptyCount === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="text-4xl">🧺</span>
          <h3 className="mt-4 text-lg font-bold tracking-tight">Trash is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Deleted Drops land here so nothing is ever lost by accident.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {trash.map((drop) => {
            const deletedDays = Math.floor((Date.now() - (drop.deletedAt ?? 0)) / 86400000);
            return (
              <div
                key={drop._id}
                className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-lg">
                  {drop.kind === "screenshot" || drop.kind === "image"
                    ? "🖼️"
                    : drop.kind === "link"
                      ? "🔗"
                      : drop.kind === "note"
                        ? "📝"
                        : "📄"}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/app/drop/${drop._id}`)}
                    className="block max-w-full cursor-pointer truncate text-sm font-bold tracking-tight hover:text-primary"
                  >
                    {drop.title}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Deleted {timeAgo(drop.deletedAt ?? 0)} · permanently removed in{" "}
                    {Math.max(0, TRASH_DAYS - deletedDays)} days
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-muted-foreground hover:text-primary"
                    onClick={async () => {
                      await restore({ id: drop._id });
                      toast("Restored to your library");
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      setBusyId(drop._id.toString());
                      try {
                        await deletePermanently({ id: drop._id });
                        toast("Deleted forever");
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    disabled={busyId === drop._id.toString()}
                  >
                    {busyId === drop._id.toString() ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Empty the trash?</DialogTitle>
            <DialogDescription>
              {emptyCount} Drop{emptyCount !== 1 ? "s" : ""} will be permanently deleted —
              files, notes and everything inside. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmptyOpen(false)}>
              Keep them
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={async () => {
                const n = await emptyTrash();
                toast(`${n} Drop${n !== 1 ? "s" : ""} permanently deleted`);
                setEmptyOpen(false);
              }}
            >
              Empty trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
