import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared data-state components. Every screen that loads user data renders
 * one of these instead of a bare spinner, so the app never shows a blank
 * or endless "loading" state:
 *
 *   INITIAL_LOADING → <ScreenSkeleton />
 *   ERROR           → <StateError onRetry={...} />
 *   EMPTY           → <EmptyState ... />
 *   READY           → content
 */

export function ScreenSkeleton({
  items = 3,
  gridClass = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
}: {
  items?: number;
  gridClass?: string;
}) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={gridClass}>
        {Array.from({ length: items }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border/60 bg-card"
          >
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StateError({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center rounded-3xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-base font-bold tracking-tight">
        {title ?? t("states.errorLoading")}
      </h3>
      {message && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{message}</p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          className="mt-4 rounded-xl"
          onClick={onRetry}
        >
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
