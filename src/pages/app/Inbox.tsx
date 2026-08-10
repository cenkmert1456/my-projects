import { DropCard } from "@/components/drops/DropCard";
import { Button } from "@/components/ui/button";
import { EmptyState, ScreenSkeleton, StateError } from "@/components/app/DataStates";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { dropService } from "@/lib/services";
import type { Drop } from "@/lib/supabase/database.types";
import { CircleAlert, Inbox as InboxIcon, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function Inbox() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const allDropsQuery = useRealtimeQuery(
    () => (userId ? dropService.listAll(userId, true) : Promise.resolve([] as Drop[])),
    { table: "drops", userId },
  );
  const allDrops = allDropsQuery.data ?? [];
  const navigate = useNavigate();

  const { processing, review, ready, failed } = useMemo(() => {
    const groups: Record<"processing" | "review" | "ready" | "failed", Drop[]> = {
      processing: [],
      review: [],
      ready: [],
      failed: [],
    };
    for (const d of allDrops) {
      if (d.status === "processing") groups.processing.push(d);
      else if (d.status === "needs_review") groups.review.push(d);
      else if (d.status === "failed") groups.failed.push(d);
      else groups.ready.push(d);
    }
    return groups;
  }, [allDrops]);

  // Explicit states — a failed or hanging query is an ERROR, never a spinner.
  if (allDropsQuery.loading && !allDropsQuery.data) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.saved")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("states.loadingMemory")}</p>
        </div>
        <ScreenSkeleton items={6} />
      </div>
    );
  }

  if (allDropsQuery.error && !allDropsQuery.data) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.saved")}</h1>
        </div>
        <StateError message={allDropsQuery.error} onRetry={allDropsQuery.refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.saved")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("states.nothingSavedDesc")}
        </p>
      </div>

      {processing.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            {t("states.loadingMemory")}
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
                    if (userId) void dropService.retryAnalysis(userId, drop._id);
                    toast("Re-analyzing…");
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {t("common.retry")}
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
            <Sparkles className="h-3.5 w-3.5 text-primary" /> {t("home.recent")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ready.map((drop, i) => (
              <DropCard key={drop._id} drop={drop} index={i} />
            ))}
          </div>
        </section>
      )}

      {allDrops.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          title={t("empty.inbox")}
          description={t("empty.inboxDesc")}
        />
      )}
    </div>
  );
}
