import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ANALYSIS_VERSION, DEFAULT_CATEGORY, isCategory } from "./lib/constants";
import { buildSearchText } from "./lib/drops_helpers";

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
      .filter((q) => q.neq(q.field("archived"), true))
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
      .filter((q) =>
        includeArchived ? q.eq(q.field("userId"), userId) : q.neq(q.field("archived"), true),
      )
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
    if (!drop || drop.userId !== userId) return null;

    // Related drops: same category, then same collection, then shared keywords.
    const sameCategory = await ctx.db
      .query("drops")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("category", drop.category))
      .filter((q) => q.and(q.neq(q.field("_id"), id), q.neq(q.field("archived"), true)))
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
      .filter((d): d is NonNullable<typeof d> => Boolean(d && !d.archived))
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
      .filter((q) => q.neq(q.field("archived"), true))
      .collect();
    const withTime = drops.filter(
      (d) =>
        (d.event?.startTime && d.event.startTime > now - 1000 * 60 * 60) ||
        (d.reservation?.startTime && d.reservation.startTime > now - 1000 * 60 * 60),
    );
    return withTime.sort((a, b) => {
      const aT = a.event?.startTime ?? a.reservation?.startTime ?? 0;
      const bT = b.event?.startTime ?? b.reservation?.startTime ?? 0;
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
      .filter((q) => q.and(q.neq(q.field("archived"), true), q.neq(q.field("product"), undefined)))
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
      .filter((q) => q.and(q.neq(q.field("archived"), true), q.neq(q.field("place"), undefined)))
      .order("desc")
      .collect();
    return drops.filter((d) => d.place);
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
      .filter((q) => q.neq(q.field("archived"), true))
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
      places: drops.filter((d) => d.place).length,
      products: drops.filter((d) => d.product).length,
      upcoming: drops.filter(
        (d) =>
          (d.event?.startTime && d.event.startTime > Date.now()) ||
          (d.reservation?.startTime && d.reservation.startTime > Date.now()),
      ).length,
      needsReview: drops.filter((d) => d.status === "needs_review" || d.status === "failed").length,
      processing: drops.filter((d) => d.status === "processing").length,
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
        .first();
      if (existing) {
        return { duplicate: true, dropId: existing._id, title: existing.title };
      }
    }

    const now = Date.now();
    const dropId = await ctx.db.insert("drops", {
      userId,
      kind: args.kind,
      title: args.title?.trim() || guessTitle(args),
      summary: args.kind === "note" ? args.text : undefined,
      category: DEFAULT_CATEGORY,
      keywords: [],
      tags: [],
      starred: false,
      archived: false,
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
        title: args.title?.trim() || guessTitle(args),
        text: args.text,
        url: args.url,
        category: DEFAULT_CATEGORY,
      }),
    });

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
    return args.fileName.replace(/\.(png|jpe?g|webp|gif|heic|pdf|docx?|txt)$/i, "").replace(/[_-]+/g, " ").slice(0, 60) || "New drop";
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
    return { archived: !drop.archived };
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

/** Permanently delete a Drop (content, file, links, reminders). */
export const remove = mutation({
  args: { id: v.id("drops") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(id);
    if (!drop || drop.userId !== userId) return null;

    // Clean up related records.
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_drop", (q) => q.eq("dropId", id))
      .collect();
    for (const r of reminders) await ctx.db.delete(r._id);

    if (drop.storageId) await ctx.storage.delete(drop.storageId);
    if (drop.thumbnailStorageId) await ctx.storage.delete(drop.thumbnailStorageId);
    await ctx.db.delete(id);
    return true;
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


