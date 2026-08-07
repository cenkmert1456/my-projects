import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Star, Link2, FileText, StickyNote } from "lucide-react";
import { useNavigate } from "react-router";
import { CATEGORY_META, KIND_META } from "@/lib/drop-meta";
import { formatPrice, timeAgo } from "@/lib/format";
import { DropStatusBadge } from "./DropStatusBadge";
import { cn } from "@/lib/utils";

export function DropCard({ drop, index = 0 }: { drop: Doc<"drops">; index?: number }) {
  const navigate = useNavigate();
  const storageUrl = useQuery(
    api.drops.getStorageUrl,
    drop.storageId ? { storageId: drop.storageId } : "skip",
  );
  const meta = CATEGORY_META[drop.category] ?? CATEGORY_META.Other;
  const hasImage = Boolean(drop.storageId);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => navigate(`/app/drop/${drop._id}`)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/30"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {hasImage ? (
          storageUrl ? (
            <img
              src={storageUrl}
              alt={drop.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-3xl">{KIND_META[drop.kind]?.emoji ?? "📦"}</span>
            </div>
          )
        ) : (
          <div className="flex h-full w-full flex-col items-start justify-between bg-gradient-to-br from-accent/70 via-card to-card p-3">
            <span className="text-2xl">{KIND_META[drop.kind]?.emoji ?? "📦"}</span>
            {drop.starred && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
          </div>
        )}
        {drop.starred && hasImage && (
          <Star className="absolute right-2.5 top-2.5 h-4 w-4 fill-amber-400 text-amber-400 drop-shadow" />
        )}
        <DropStatusBadge
          status={drop.status}
          className="absolute bottom-2.5 left-2.5 bg-background/85 backdrop-blur"
        />
      </div>

      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
          {drop.title}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
              meta.chip,
            )}
          >
            {meta.emoji} {drop.category}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            {drop.product?.price !== undefined && (
              <span className="font-semibold text-foreground">
                {formatPrice(drop.product.price, drop.product.currency)}
              </span>
            )}
            {drop.kind === "link" && <Link2 className="h-3 w-3" />}
            {drop.kind === "document" && <FileText className="h-3 w-3" />}
            {drop.kind === "note" && <StickyNote className="h-3 w-3" />}
            <span>{timeAgo(drop.savedAt)}</span>
          </span>
        </div>
      </div>
    </motion.button>
  );
}
