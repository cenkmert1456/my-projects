import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { ANALYSIS_VERSION, DEFAULT_CATEGORY, isCategory } from "./lib/constants";
import { buildSearchText } from "./lib/drops_helpers";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ---------------------------------------------------------------------------
// Activity history (lightweight, non-invasive)
// ---------------------------------------------------------------------------

async function logActivity(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  action: string,
  dropId?: Id<"drops">,
  detail?: string,
) {
  try {
    await ctx.db.insert("activities", {
      userId,
      dropId,
      action,
      detail,
      at: Date.now(),
    });
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) => q.and(q.neq(q.field("archived"), true), q.eq(q.field("deletedAt"), undefined)))
      .order("desc")
      .take(limit ?? 24);
    return drops;
  },
});

export const listAll = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) => {
        const notDeleted = q.eq(q.field("deletedAt"), undefined);
        return includeArchived ? notDeleted : q.and(notDeleted, q.neq(q.field("archived"), true));
      })
      .order("desc")
      .collect();
    return drops;
  },
});

export const get = query({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId || drop.deletedAt) return null;

    // Related drops: same category, then same collection, then shared keywords.
    const sameCategory = await ctx.db
      .query("drops")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("category", drop.category))
      .filter((q) =>
        q.and(
          q.neq(q.field("_id"), id),
          q.neq(q.field("archived"), true),
          q.eq(q.field("deletedAt"), undefined),
        ),
      )
      .order("desc")
      .take(6);
    const related = sameCategory.filter((d) => d._id !== id);

    return { drop, related };
  },
});

export const byCollection = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== userId) return [];
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();
    const dropIds = links.map((l) => l.dropId);
    if (!dropIds.length) return [];
    const drops = await Promise.all(dropIds.map((id) => ctx.db.get(id)));
    return drops
      .filter((d): d is NonNullable<typeof d> => Boolean(d && !d.archived && !d.deletedAt))
      .sort((a, b) => b.savedAt - a.savedAt);
  },
});

export const upcoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(q.neq(q.field("archived"), true), q.eq(q.field("deletedAt"), undefined)),
      )
      .collect();
    const withTime = drops.filter(
      (d) =>
        (d.event?.startTime && d.event.startTime > now - 1000 * 60 * 60) ||
        (d.reservation?.startTime && d.reservation.startTime > now - 1000 * 60 * 60) ||
        (d.flight?.departureTime && d.flight.departureTime > now - 1000 * 60 * 60) ||
        (d.receipt?.returnDeadline && d.receipt.returnDeadline > now),
    );
    return withTime.sort((a, b) => {
      const aT =
        a.event?.startTime ??
        a.reservation?.startTime ??
        a.flight?.departureTime ??
        a.receipt?.returnDeadline ??
        0;
      const bT =
        b.event?.startTime ??
        b.reservation?.startTime ??
        b.flight?.departureTime ??
        b.receipt?.returnDeadline ??
        0;
      return aT - bT;
    });
  },
});

export const wishlist = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.neq(q.field("archived"), true),
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("product"), undefined),
        ),
      )
      .order("desc")
      .collect();
    return drops.filter((d) => d.product);
  },
});

export const places = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.neq(q.field("archived"), true),
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("place"), undefined),
        ),
      )
      .order("desc")
      .collect();
    return drops.filter((d) => d.place);
  },
});

/** Drops currently in Trash (soft-deleted, recoverable). */
export const trash = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) => q.neq(q.field("deletedAt"), undefined))
      .order("desc")
      .collect();
    return drops.filter((d) => d.deletedAt);
  },
});

/** Resolve a signed/private storage URL for a drop's file (images, documents). */
export const getStorageUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.storage.getUrl(storageId);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(q.neq(q.field("archived"), true), q.eq(q.field("deletedAt"), undefined)),
      )
      .collect();
    const byCategory: Record<string, number> = {};
    for (const d of drops) {
      byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    }
    return {
      total: drops.length,
      byCategory,
      byKind: drops.reduce<Record<string, number>>((acc, d) => {
        acc[d.kind] = (acc[d.kind] ?? 0) + 1;
        return acc;
      }, {}),
      starred: drops.filter((d) => d.starred).length,
      pinned: drops.filter((d) => d.pinned).length,
      places: drops.filter((d) => d.place).length,
      products: drops.filter((d) => d.product).length,
      upcoming: drops.filter(
        (d) =>
          (d.event?.startTime && d.event.startTime > Date.now()) ||
          (d.reservation?.startTime && d.reservation.startTime > Date.now()) ||
          (d.flight?.departureTime && d.flight.departureTime > Date.now()) ||
          (d.receipt?.returnDeadline && d.receipt.returnDeadline > Date.now()),
      ).length,
      needsReview: drops.filter((d) => d.status === "needs_review" || d.status === "failed").length,
      processing: drops.filter((d) => d.status === "processing").length,
      documents: drops.filter((d) => d.kind === "document").length,
      screenshots: drops.filter((d) => d.kind === "screenshot" || d.kind === "image").length,
      links: drops.filter((d) => d.kind === "link").length,
      notes: drops.filter((d) => d.kind === "note").length,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

const DROP_CREATE_ARGS = {
  kind: v.union(
    v.literal("image"),
    v.literal("screenshot"),
    v.literal("link"),
    v.literal("note"),
    v.literal("document"),
  ),
  storageId: v.optional(v.string()),
  contentType: v.optional(v.string()),
  fileName: v.optional(v.string()),
  url: v.optional(v.string()),
  text: v.optional(v.string()),
  title: v.optional(v.string()),
  source: v.optional(v.string()),
  saveAnyway: v.optional(v.boolean()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: DROP_CREATE_ARGS,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate kind-specific payload.
    if (args.kind === "link" && !args.url) throw new Error("A link Drop needs a URL");
    if (args.kind === "note" && !args.text) throw new Error("A note Drop needs text");
    if ((args.kind === "image" || args.kind === "screenshot" || args.kind === "document") && !args.storageId) {
      throw new Error("Upload the file first");
    }

    // Duplicate detection: identical saved URLs (normalized).
    if (args.url && !args.saveAnyway) {
      const normalized = args.url.trim();
      const existing = await ctx.db
        .query("drops")
        .withIndex("by_url", (q) => q.eq("userId", userId).eq("url", normalized))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .first();
      if (existing) {
        return { duplicate: true, dropId: existing._id, title: existing.title };
      }
    }

    const now = Date.now();
    const title = args.title?.trim() || guessTitle(args);
    const dropId = await ctx.db.insert("drops", {
      userId,
      kind: args.kind,
      title,
      summary: args.kind === "note" ? args.text : undefined,
      category: DEFAULT_CATEGORY,
      keywords: [],
      tags: [],
      starred: false,
      archived: false,
      pinned: false,
      sensitive: false,
      notes: args.notes,
      savedAt: now,
      status: "processing",
      analysisStatus: "pending",
      entities: [],
      url: args.url?.trim(),
      text: args.text,
      storageId: args.storageId,
      contentType: args.contentType,
      fileName: args.fileName,
      source: args.source,
      searchText: buildSearchText({
        title,
        text: args.text,
        url: args.url,
        category: DEFAULT_CATEGORY,
      }),
    });

    await logActivity(ctx, userId, "saved", dropId as Id<"drops">, args.kind);

    // Kick off AI analysis asynchronously — the drop is saved immediately.
    await ctx.scheduler.runAfter(0, internal.analyze.analyzeDrop, { dropId });
    return { duplicate: false, dropId };
  },
});

function guessTitle(args: {
  kind: string;
  fileName?: string;
  url?: string;
  text?: string;
}): string {
  if (args.fileName) {
    return args.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 60) || "New drop";
  }
  if (args.url) {
    try {
      const host = new URL(args.url).hostname.replace(/^www\./, "");
      return `Saved link — ${host}`;
    } catch {
      return "Saved link";
    }
  }
  if (args.text) return args.text.slice(0, 48) + (args.text.length > 48 ? "…" : "");
  return "New drop";
}

export const update = mutation({
  args: {
    id: v.id("drops"),
    patch: v.object({
      title: v.optional(v.string()),
      summary: v.optional(v.string()),
      category: v.optional(v.string()),
      subcategory: v.optional(v.string()),
      text: v.optional(v.string()),
      url: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;

    const next = { ...drop, ...patch };
    if (patch.category && !isCategory(patch.category)) {
      throw new Error("Unknown category");
    }
    const searchText = buildSearchText({
      title: next.title,
      summary: next.summary,
      keywords: next.keywords,
      tags: next.tags,
      text: next.text,
      ocrText: next.ocrText,
      category: next.category,
      subcategory: next.subcategory,
      url: next.url,
      source: next.source,
      entities: next.entities,
    });
    await ctx.db.patch(id, { ...patch, searchText });
    await logActivity(ctx, userId, "edited", id);
    return await ctx.db.get(id);
  },
});

export const setCategory = mutation({
  args: { id: v.id("drops"), category: v.string() },
  handler: async (ctx, { id, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!isCategory(category)) throw new Error("Unknown category");
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags: drop.tags,
      text: drop.text,
      ocrText: drop.ocrText,
      category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });
    await ctx.db.patch(id, { category, searchText });
    return await ctx.db.get(id);
  },
});

export const toggleStar = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { starred: !drop.starred });
    await logActivity(ctx, userId, drop.starred ? "unstarred" : "starred", id);
    return { starred: !drop.starred };
  },
});

export const toggleArchive = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { archived: !drop.archived });
    await logActivity(ctx, userId, drop.archived ? "unarchived" : "archived", id);
    return { archived: !drop.archived };
  },
});

export const togglePin = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { pinned: !drop.pinned });
    return { pinned: !drop.pinned };
  },
});

export const toggleSensitive = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { sensitive: !drop.sensitive });
    await logActivity(ctx, userId, drop.sensitive ? "unmarked sensitive" : "marked sensitive", id);
    return { sensitive: !drop.sensitive };
  },
});

export const setNotes = mutation({
  args: { id: v.id("drops"), notes: v.optional(v.string()) },
  handler: async (ctx, { id, notes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    const clean = notes?.trim() || undefined;
    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags: drop.tags,
      text: drop.text,
      notes: clean,
      ocrText: drop.ocrText,
      category: drop.category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });
    await ctx.db.patch(id, { notes: clean, searchText });
    return clean;
  },
});

export const addTag = mutation({
  args: { id: v.id("drops"), tag: v.string() },
  handler: async (ctx, { id, tag }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    const tags = Array.from(new Set([...drop.tags, tag.trim().toLowerCase().replace(/\s+/g, "-")]));
    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags,
      text: drop.text,
      ocrText: drop.ocrText,
      category: drop.category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });
    await ctx.db.patch(id, { tags, searchText });
    return tags;
  },
});

export const removeTag = mutation({
  args: { id: v.id("drops"), tag: v.string() },
  handler: async (ctx, { id, tag }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    const tags = drop.tags.filter((t) => t !== tag);
    await ctx.db.patch(id, { tags });
    return tags;
  },
});

/** Soft delete → Trash. Content stays recoverable for 30 days. */
export const softRemove = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { deletedAt: Date.now(), pinned: false });
    await logActivity(ctx, userId, "moved to trash", id);
    return true;
  },
});

export const restore = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, { deletedAt: undefined });
    await logActivity(ctx, userId, "restored from trash", id);
    return true;
  },
});

/** Permanently delete a Drop (content, file, links, reminders, stack links). */
export const deletePermanently = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;

    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);

    const stackLinks = await ctx.db
      .query("stackDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const link of stackLinks) await ctx.db.delete(link._id);

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const r of reminders) await ctx.db.delete(r._id);

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const a of activities) await ctx.db.delete(a._id);

    if (drop.storageId) await ctx.storage.delete(drop.storageId);
    if (drop.thumbnailStorageId) await ctx.storage.delete(drop.thumbnailStorageId);
    await ctx.db.delete(id);
    return true;
  },
});

/** Empty the Trash (permanently deletes everything soft-deleted). */
export const emptyTrash = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .filter((q) => q.neq(q.field("deletedAt"), undefined))
      .collect();
    for (const drop of drops) {
      await ctx.runMutation(api.drops.deletePermanently, { id: drop._id });
    }
    return drops.length;
  },
});

/** Merge two duplicate Drops into one (notes, tags, keywords, links, reminders). */
export const mergeDrops = mutation({
  args: { keepId: v.id("drops"), removeId: v.id("drops") },
  handler: async (ctx, { keepId, removeId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const keep = await ctx.db.get(keepId);
    const remove = await ctx.db.get(removeId);
    if (!keep || keep.userId !== userId || !remove || remove.userId !== userId || keepId === removeId) {
      return null;
    }

    const notes = [keep.notes, remove.notes].filter(Boolean).join("\n\n") || undefined;
    const tags = Array.from(new Set([...keep.tags, ...remove.tags]));
    const keywords = Array.from(new Set([...keep.keywords, ...remove.keywords]));

    const collectionLinks = await ctx.db
      .query("collectionDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", removeId))
      .collect();
    for (const link of collectionLinks) {
      const dup = await ctx.db
        .query("collectionDrops")
        .withIndex("by_collection", (q) => q.eq("collectionId", link.collectionId))
        .filter((q) => q.eq(q.field("dropId"), keepId))
        .first();
      if (!dup) {
        await ctx.db.insert("collectionDrops", {
          collectionId: link.collectionId,
          dropId: keepId,
          userId,
        });
      }
      await ctx.db.delete(link._id);
    }

    const stackLinks = await ctx.db
      .query("stackDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", removeId))
      .collect();
    for (const link of stackLinks) {
      const dup = await ctx.db
        .query("stackDrops")
        .withIndex("by_stack", (q) => q.eq("stackId", link.stackId))
        .filter((q) => q.eq(q.field("dropId"), keepId))
        .first();
      if (!dup) {
        await ctx.db.insert("stackDrops", { stackId: link.stackId, dropId: keepId, userId });
      }
      await ctx.db.delete(link._id);
    }

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_drop", (q) => q.eq("dropId", removeId))
      .collect();
    for (const r of reminders) await ctx.db.patch(r._id, { dropId: keepId });

    await ctx.db.patch(keepId, { notes, tags, keywords });

    // Keep the newer/richer title; otherwise keep the surviving drop's.
    if (remove.savedAt > keep.savedAt) {
      await ctx.db.patch(keepId, {
        title: remove.title,
        summary: remove.summary ?? keep.summary,
        url: remove.url ?? keep.url,
        product: remove.product ?? keep.product,
        place: remove.place ?? keep.place,
      });
    }
    if (remove.storageId && !keep.storageId) {
      await ctx.db.patch(keepId, { storageId: remove.storageId });
    } else if (remove.storageId && remove.storageId !== keep.storageId) {
      await ctx.storage.delete(remove.storageId);
    }
    if (remove.thumbnailStorageId && remove.thumbnailStorageId !== keep.thumbnailStorageId) {
      await ctx.storage.delete(remove.thumbnailStorageId);
    }
    await ctx.db.patch(removeId, { deletedAt: Date.now() });
    await logActivity(ctx, userId, "merged duplicate", keepId, `removed ${removeId}`);
    return keepId;
  },
});

/** Bulk actions for selection mode. */
export const bulkAction = mutation({
  args: {
    ids: v.array(v.id("drops")),
    action: v.union(
      v.literal("star"),
      v.literal("archive"),
      v.literal("trash"),
      v.literal("restore"),
      v.literal("pin"),
      v.literal("sensitive"),
    ),
  },
  handler: async (ctx, { ids, action }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    let changed = 0;
    for (const id of ids) {
      const drop = await ctx.db.get(id);
      if (!drop || drop.userId !== userId) continue;
      if (action === "star") await ctx.db.patch(id, { starred: !drop.starred });
      else if (action === "archive") await ctx.db.patch(id, { archived: !drop.archived });
      else if (action === "pin") await ctx.db.patch(id, { pinned: !drop.pinned });
      else if (action === "sensitive") await ctx.db.patch(id, { sensitive: !drop.sensitive });
      else if (action === "trash") await ctx.db.patch(id, { deletedAt: Date.now(), pinned: false });
      else if (action === "restore") await ctx.db.patch(id, { deletedAt: undefined });
      changed++;
    }
    return changed;
  },
});

/** Reset + re-run AI analysis (e.g. after adding a provider key). */
export const retryAnalysis = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    await ctx.db.patch(id, {
      status: "processing",
      analysisStatus: "pending",
      analysisVersion: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.analyze.analyzeDrop, { dropId: id });
    return true;
  },
});

// ---------------------------------------------------------------------------
// DROP Intelligence — on-device results (native OCR / native embeddings)
//
// The mobile apps run the DropAI engine on-device (offline, private). These
// mutations let the native layer feed the shared backend so results are
// immediately searchable across web, Android and iOS — with server-side
// ownership checks on every write.
// ---------------------------------------------------------------------------

/**
 * Attach native OCR text to a Drop. The text is merged into the searchable
 * content immediately (full-text + keyword search), so screenshots become
 * searchable the moment OCR finishes — with or without any generative model.
 */
export const attachOcr = mutation({
  args: { id: v.id("drops"), ocrText: v.string(), ocrMeta: v.optional(v.object({ language: v.optional(v.string()) })) },
  handler: async (ctx, { id, ocrText, ocrMeta }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;

    const clean = ocrText.slice(0, 50_000).trim();
    if (!clean) return null;
    const ocrLanguage = ocrMeta?.language ?? drop.ocrLanguage;

    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags: drop.tags,
      text: drop.text,
      notes: drop.notes,
      ocrText: clean,
      category: drop.category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });

    const next: Record<string, unknown> = {
      ocrText: clean,
      ocrLanguage,
      ocrEngine: "native",
      searchText,
    };
    // A Drop that was still waiting on analysis becomes searchable now;
    // richer analysis may still upgrade it later.
    if (drop.status === "processing" && !drop.summary) {
      next.status = "ready";
      next.analysisStatus = "ready";
    }
    await ctx.db.patch(id, next);
    return { ocrText: clean };
  },
});

/**
 * Attach an on-device embedding (semantic search vector). DROP's native
 * engine mirrors the built-in deterministic embed algorithm, so on-device
 * vectors stored with provider "demo" match server-side cosine scoring
 * exactly — semantic search works with zero configuration.
 */
export const attachEmbedding = mutation({
  args: { id: v.id("drops"), embedding: v.array(v.number()), provider: v.string() },
  handler: async (ctx, { id, embedding, provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;
    if (embedding.length < 8 || embedding.length > 512) throw new Error("Invalid embedding size");
    if (embedding.some((n) => !Number.isFinite(n))) throw new Error("Invalid embedding values");
    const existing = drop.embedding;
    if (existing && existing.length === embedding.length) {
      // Idempotent — don't churn writes for identical vectors.
      let same = true;
      for (let i = 0; i < existing.length; i++) {
        if (Math.abs(existing[i] - embedding[i]) > 1e-9) {
          same = false;
          break;
        }
      }
      if (same) return { stored: true };
    }
    await ctx.db.patch(id, { embedding, embeddingProvider: provider });
    return { stored: true };
  },
});

/**
 * Attach a full structured analysis produced on-device (mobile DropAI
 * engine, Tier A/B devices). Mirrors what analyze.ts stores so the pipeline
 * and the native engine share one schema.
 */
export const attachAnalysis = mutation({
  args: {
    id: v.id("drops"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    entities: v.optional(
      v.array(
        v.object({
          type: v.string(),
          value: v.string(),
          confidence: v.optional(v.number()),
          metadata: v.optional(v.record(v.string(), v.string())),
        }),
      ),
    ),
    language: v.optional(v.string()),
    confidence: v.optional(v.number()),
    ocrText: v.optional(v.string()),
    suggestedAction: v.optional(v.string()),
    suggestedReminder: v.optional(v.object({ text: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const drop = await ctx.db.get(args.id);
    if (!drop || drop.userId !== userId) return null;

    const category = args.category && isCategory(args.category) ? args.category : drop.category;
    const searchText = buildSearchText({
      title: args.title ?? drop.title,
      summary: args.summary ?? drop.summary,
      keywords: args.keywords ?? drop.keywords,
      tags: drop.tags,
      text: drop.text,
      notes: drop.notes,
      ocrText: args.ocrText ?? drop.ocrText,
      category,
      subcategory: args.subcategory ?? drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: args.entities ?? drop.entities,
    });
    const patch: Record<string, unknown> = {
      title: args.title ?? drop.title,
      summary: args.summary ?? drop.summary,
      category,
      subcategory: args.subcategory ?? drop.subcategory,
      keywords: args.keywords ?? drop.keywords,
      entities: args.entities ?? drop.entities,
      language: args.language ?? drop.language,
      ocrText: args.ocrText ?? drop.ocrText,
      ocrEngine: args.ocrText ? "native" : drop.ocrEngine,
      confidence: args.confidence ?? drop.confidence,
      suggestedAction: args.suggestedAction ?? drop.suggestedAction,
      suggestedReminder: args.suggestedReminder ?? drop.suggestedReminder,
      status: "ready",
      analysisStatus: "ready",
      searchText,
    };
    await ctx.db.patch(args.id, patch);
    await logActivity(ctx, userId, "analyzed on device", args.id);
    return { ok: true };
  },
});
