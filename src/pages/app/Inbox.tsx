import { api } from "@/convex/_generated/api";
import { DropCard } from "@/components/drops/DropCard";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { CircleAlert, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Inbox() {
  const allDrops = useQuery(api.drops.listAll, { includeArchived: true });
  const retryAnalysis = useMutation(api.drops.retryAnalysis);
  const navigate = useNavigate();

  const { processing, review, ready, failed } = useMemo(() => {
    type DropGroup = NonNullable<typeof allDrops>;
    const groups: Record<"processing" | "review" | "ready" | "failed", DropGroup> = {
      processing: [],
      review: [],
      ready: [],
      failed: [],
    };
    for (const d of allDrops ?? []) {
      if (d.status === "processing") groups.processing.push(d);
      else if (d.status === "needs_review") groups.review.push(d);
      else if (d.status === "failed") groups.failed.push(d);
      else groups.ready.push(d);
    }
    return groups;
  }, [allDrops]);

  if (!allDrops) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every new Drop lands here while DROP understands it.
        </p>
      </div>

      {processing.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Understanding your Drops…
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {processing.map((drop, i) => (
              <DropCard key={drop._id} drop={drop} index={i} />
            ))}
          </div>
        </section>
      )}

      {(review.length > 0 || failed.length > 0) && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Help DROP understand these
          </h2>
          <div className="space-y-2.5">
            {[...failed, ...review].map((drop) => (
              <div
                key={drop._id}
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5"
              >
                <span
                  className={
                    drop.status === "failed"
                      ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                      : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  }
                >
                  <CircleAlert className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{drop.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {drop.status === "failed"
                      ? "Analysis couldn't finish. Your Drop is safe — retry anytime."
                      : "DROP wasn't fully sure about this one. Review or adjust it."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void retryAnalysis({ id: drop._id });
                    toast("Re-analyzing…");
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/app/drop/${drop._id}`)}>
                  Review
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {ready.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Understood
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ready.map((drop, i) => (
              <DropCard key={drop._id} drop={drop} index={i} />
            ))}
          </div>
        </section>
      )}

      {allDrops.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Sparkles className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">Your inbox is empty</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Drop something and it will appear here — instantly, while DROP starts understanding it.
          </p>
        </div>
      )}
    </div>
  );
}
