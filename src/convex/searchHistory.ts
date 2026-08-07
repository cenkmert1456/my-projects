import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 12);
  },
});

export const record = internalMutation({
  args: { query: v.string(), resultCount: v.optional(v.number()) },
  handler: async (ctx, { query, resultCount }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const q = query.trim().slice(0, 120);
    if (!q) return null;
    await ctx.db.insert("searchHistory", { userId, query: q, resultCount });
    // Cap history at 40 entries per user.
    const all = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    if (all.length > 40) {
      for (const extra of all.slice(40)) {
        await ctx.db.delete(extra._id);
      }
    }
    return true;
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const all = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const item of all) await ctx.db.delete(item._id);
    return true;
  },
});
