import { Loader2, CircleAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function DropStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  if (status === "processing") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Understanding…
      </span>
    );
  }
  if (status === "needs_review") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300",
          className,
        )}
      >
        <TriangleAlert className="h-3 w-3" />
        Needs review
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive",
          className,
        )}
      >
        <CircleAlert className="h-3 w-3" />
        Analysis pending
      </span>
    );
  }
  return null;
}
