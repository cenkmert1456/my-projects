import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user_remindAt", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .order("asc")
      .collect();
    // Attach the drop title for display.
    return await Promise.all(
      reminders.map(async (r) => {
        const drop = await ctx.db.get(r.dropId);
        return { ...r, dropTitle: drop?.title ?? "Deleted drop", dropArchived: drop?.archived ?? false };
      }),
    );
  },
});

export const listForDrop = query({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_drop", (q) => q.eq("dropId", dropId))
      .collect();
    return reminders.filter((r) => r.userId === userId);
  },
});

export const create = mutation({
  args: {
    dropId: v.id("drops"),
    text: v.string(),
    remindAt: v.number(),
  },
  handler: async (ctx, { dropId, text, remindAt }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drop = await ctx.db.get(dropId);
    if (!drop || drop.userId !== userId) return null;
    if (!text.trim()) throw new Error("Reminder text is required");
    if (!Number.isFinite(remindAt)) throw new Error("Invalid reminder time");
    return await ctx.db.insert("reminders", {
      userId,
      dropId,
      text: text.trim().slice(0, 200),
      remindAt,
      status: "pending",
    });
  },
});

export const complete = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const reminder = await ctx.db.get(id);
    if (!reminder || reminder.userId !== userId) return false;
    await ctx.db.patch(id, { status: "completed" });
    return true;
  },
});

export const dismiss = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const reminder = await ctx.db.get(id);
    if (!reminder || reminder.userId !== userId) return false;
    await ctx.db.patch(id, { status: "dismissed" });
    return true;
  },
});

export const remove = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const reminder = await ctx.db.get(id);
    if (!reminder || reminder.userId !== userId) return false;
    await ctx.db.delete(id);
    return true;
  },
});
