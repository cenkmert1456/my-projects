import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// Stacks — active research/context groups ("Japan 2027", "New Gaming PC").
// Distinct from Collections: collections are long-term categories; stacks are
// short/medium-term research groups. A Drop can belong to both.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const stacks = await ctx.db
      .query("stacks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const withCounts = await Promise.all(
      stacks.map(async (stack) => {
        const links = await ctx.db
          .query("stackDrops")
          .withIndex("by_stack", (q) => q.eq("stackId", stack._id))
          .collect();
        const drops = (await Promise.all(links.map((l) => ctx.db.get(l.dropId)))).filter(
          (d): d is NonNullable<typeof d> => Boolean(d && !d.deletedAt && !d.archived),
        );
        return { stack, count: drops.length, drops: drops.slice(0, 3) };
      }),
    );
    return withCounts.sort((a, b) => b.stack.createdAt - a.stack.createdAt);
  },
});

export const get = query({
  args: { id: v.id("stacks") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stack = await ctx.db.get(id);
    if (!stack || stack.userId !== userId) return null;
    const links = await ctx.db
      .query("stackDrops")
      .withIndex("by_stack", (q) => q.eq("stackId", id))
      .collect();
    const drops = (await Promise.all(links.map((l) => ctx.db.get(l.dropId))))
      .filter((d): d is NonNullable<typeof d> => Boolean(d && !d.deletedAt && !d.archived))
      .sort((a, b) => b.savedAt - a.savedAt);
    return { stack, drops };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    emoji: v.optional(v.string()),
    description: v.optional(v.string()),
    dropIds: v.optional(v.array(v.id("drops"))),
  },
  handler: async (ctx, { name, emoji, description, dropIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const clean = name.trim();
    if (!clean) throw new Error("A stack needs a name");
    const stackId = await ctx.db.insert("stacks", {
      userId,
      name: clean.slice(0, 80),
      emoji: emoji ?? "🗂️",
      description: description?.slice(0, 300),
      createdAt: Date.now(),
    });
    for (const dropId of dropIds ?? []) {
      const drop = await ctx.db.get(dropId);
      if (drop && drop.userId === userId) {
        await ctx.db.insert("stackDrops", { stackId, dropId, userId });
      }
    }
    return stackId;
  },
});

export const update = mutation({
  args: {
    id: v.id("stacks"),
    patch: v.object({
      name: v.optional(v.string()),
      emoji: v.optional(v.string()),
      description: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stack = await ctx.db.get(id);
    if (!stack || stack.userId !== userId) return null;
    await ctx.db.patch(id, patch);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("stacks") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stack = await ctx.db.get(id);
    if (!stack || stack.userId !== userId) return null;
    const links = await ctx.db
      .query("stackDrops")
      .withIndex("by_stack", (q) => q.eq("stackId", id))
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
    await ctx.db.delete(id);
    return true;
  },
});

export const addDrop = mutation({
  args: { stackId: v.id("stacks"), dropId: v.id("drops") },
  handler: async (ctx, { stackId, dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stack = await ctx.db.get(stackId);
    const drop = await ctx.db.get(dropId);
    if (!stack || stack.userId !== userId || !drop || drop.userId !== userId) return null;
    const existing = await ctx.db
      .query("stackDrops")
      .withIndex("by_stack", (q) => q.eq("stackId", stackId))
      .filter((q) => q.eq(q.field("dropId"), dropId))
      .first();
    if (existing) return true;
    await ctx.db.insert("stackDrops", { stackId, dropId, userId });
    return true;
  },
});

export const removeDrop = mutation({
  args: { stackId: v.id("stacks"), dropId: v.id("drops") },
  handler: async (ctx, { stackId, dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stack = await ctx.db.get(stackId);
    if (!stack || stack.userId !== userId) return null;
    const link = await ctx.db
      .query("stackDrops")
      .withIndex("by_stack", (q) => q.eq("stackId", stackId))
      .filter((q) => q.eq(q.field("dropId"), dropId))
      .first();
    if (link) await ctx.db.delete(link._id);
    return true;
  },
});

/** Stack ids a drop belongs to (used by Drop detail to render stack chips). */
export const forDrop = query({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const links = await ctx.db
      .query("stackDrops")
      .withIndex("by_drop", (q) => q.eq("dropId", dropId))
      .collect();
    const stacks = await Promise.all(
      links.map(async (l) => {
        const stack = await ctx.db.get(l.stackId);
        return stack && stack.userId === userId ? stack : null;
      }),
    );
    return stacks.filter((s): s is NonNullable<typeof s> => Boolean(s));
  },
});

export type StackId = Id<"stacks">;
