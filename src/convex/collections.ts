import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const byCollection = new Map<string, typeof links>();
    for (const link of links) {
      const arr = byCollection.get(link.collectionId.toString()) ?? [];
      arr.push(link);
      byCollection.set(link.collectionId.toString(), arr);
    }
    return collections.map((c) => ({
      ...c,
      dropCount: byCollection.get(c._id.toString())?.length ?? 0,
    }));
  },
});

export const get = query({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== userId) return null;
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();
    const drops = (
      await Promise.all(links.map((l) => ctx.db.get(l.dropId)))
    ).filter((d): d is NonNullable<typeof d> => Boolean(d && !d.archived));
    return { collection, drops: drops.sort((a, b) => b.savedAt - a.savedAt) };
  },
});

export const withDrop = query({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", dropId))
      .collect();
    const collections = await Promise.all(links.map((l) => ctx.db.get(l.collectionId)));
    return collections.filter((c): c is NonNullable<typeof c> => Boolean(c && c.userId === userId));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const name = args.name.trim();
    if (!name) throw new Error("Collection name is required");
    return await ctx.db.insert("collections", {
      userId,
      name: name.slice(0, 60),
      emoji: args.emoji ?? "📁",
      color: args.color,
      description: args.description?.slice(0, 160),
      isPublic: false,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("collections"),
    patch: v.object({
      name: v.optional(v.string()),
      emoji: v.optional(v.string()),
      color: v.optional(v.string()),
      description: v.optional(v.string()),
      isPublic: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const collection = await ctx.db.get(id);
    if (!collection || collection.userId !== userId) return null;
    await ctx.db.patch(id, patch);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("collections") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const collection = await ctx.db.get(id);
    if (!collection || collection.userId !== userId) return false;
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(id);
    return true;
  },
});

export const addDrop = mutation({
  args: { collectionId: v.id("collections"), dropId: v.id("drops") },
  handler: async (ctx, { collectionId, dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.userId !== userId) return false;
    const drop = await ctx.db.get(dropId);
    if (!drop || drop.userId !== userId) return false;
    const existing = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .filter((q) => q.eq(q.field("dropId"), dropId))
      .first();
    if (existing) return true;
    await ctx.db.insert("collectionDrops", { collectionId, dropId, userId });
    return true;
  },
});

export const removeDrop = mutation({
  args: { collectionId: v.id("collections"), dropId: v.id("drops") },
  handler: async (ctx, { collectionId, dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const link = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .filter((q) => q.eq(q.field("dropId"), dropId))
      .first();
    if (!link || link.userId !== userId) return false;
    await ctx.db.delete(link._id);
    return true;
  },
});
