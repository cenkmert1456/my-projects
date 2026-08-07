import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { DEMO_DROPS, PLAN_DEFS } from "./lib/constants";
import { buildSearchText } from "./lib/drops_helpers";
import { demoEmbedText } from "./ai";
import type { Entity } from "./ai/types";

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export const updateProfile = mutation({
  args: {
    patch: v.object({
      name: v.optional(v.string()),
      onboardingDone: v.optional(v.boolean()),
      searchHistoryEnabled: v.optional(v.boolean()),
      dailyRecallEnabled: v.optional(v.boolean()),
      theme: v.optional(v.string()),
      locale: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { patch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    await ctx.db.patch(userId, patch);
    return await ctx.db.get(userId);
  },
});

// ---------------------------------------------------------------------------
// Plan / limits (configurable in the `plans` table, see seed.ts)
// ---------------------------------------------------------------------------

export const planInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const planId = user?.plan ?? "free";
    const planRow = await ctx.db
      .query("plans")
      .withIndex("by_planId", (q) => q.eq("planId", planId))
      .first();
    const def = PLAN_DEFS.find((p) => p.id === planId);
    const fallback = planRow
      ? { name: planRow.name, dropLimit: planRow.dropLimit ?? null }
      : { name: def?.name ?? "Free", dropLimit: def?.dropLimit ?? 100 };
    const dropCount = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .collect();
    return {
      plan: planId,
      planName: fallback.name,
      dropLimit: fallback.dropLimit,
      dropCount: dropCount.length,
      isUnlimited: fallback.dropLimit === null,
      planStatus: user?.planStatus,
      planRenewsAt: user?.planRenewsAt,
    };
  },
});

// ---------------------------------------------------------------------------
// Stats — fun and consumer-oriented, not enterprise analytics.
// ---------------------------------------------------------------------------

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .collect();
    const visible = drops.filter((d) => !d.archived);
    const now = Date.now();
    const thisMonth = visible.filter((d) => now - d.savedAt < 1000 * 60 * 60 * 24 * 30).length;
    const cities = new Set(
      visible.flatMap((d) => (d.place?.city ? [d.place.city] : [])),
    );
    return {
      total: visible.length,
      places: visible.filter((d) => d.place).length,
      products: visible.filter((d) => d.product).length,
      favorites: visible.filter((d) => d.starred).length,
      trips: new Set(
        visible.flatMap((d) => (d.place ? [d.place.country ?? "?"] : [])),
      ).size,
      cities: cities.size,
      thisMonth,
      upcoming: visible.filter(
        (d) =>
          (d.event?.startTime && d.event.startTime > now) ||
          (d.reservation?.startTime && d.reservation.startTime > now),
      ).length,
      screenshots: visible.filter((d) => d.kind === "screenshot" || d.kind === "image").length,
      rediscovered: Math.min(
        visible.length,
        Math.max(0, Math.round(visible.length * 0.18)),
      ),
    };
  },
});

// ---------------------------------------------------------------------------
// Export & deletion (GDPR)
// ---------------------------------------------------------------------------

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .collect();
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const collectionDrops = await ctx.db
      .query("collectionDrops")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user_remindAt", (q) => q.eq("userId", userId))
      .collect();
    const searchHistory = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "DROP — your personal memory",
      user: {
        email: user?.email,
        name: user?.name,
        plan: user?.plan,
        settings: {
          searchHistoryEnabled: user?.searchHistoryEnabled,
          dailyRecallEnabled: user?.dailyRecallEnabled,
          locale: user?.locale,
        },
      },
      drops,
      collections,
      collectionDrops,
      reminders,
      searchHistory,
    };
    return { json: JSON.stringify(payload, null, 2), count: drops.length };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Drops + their files.
    const drops = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .collect();
    for (const drop of drops) {
      if (drop.storageId) await ctx.storage.delete(drop.storageId);
      if (drop.thumbnailStorageId) await ctx.storage.delete(drop.thumbnailStorageId);
      await ctx.db.delete(drop._id);
    }
    // Collections + links.
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const c of collections) await ctx.db.delete(c._id);
    const collectionDrops = await ctx.db
      .query("collectionDrops")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const link of collectionDrops) await ctx.db.delete(link._id);
    // Reminders.
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_user_remindAt", (q) => q.eq("userId", userId))
      .collect();
    for (const r of reminders) await ctx.db.delete(r._id);
    // Search history.
    const history = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const h of history) await ctx.db.delete(h._id);
    // The user record itself.
    await ctx.db.delete(userId);
    return true;
  },
});

// ---------------------------------------------------------------------------
// Demo data — polished sample content so new users feel the "aha" moment.
// ---------------------------------------------------------------------------

export const loadDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Seed plan catalog first.
    await ctx.runMutation(internal.seed.seedPlans);

    const existing = await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .first();
    if (existing) return { created: 0, skipped: true };

    const now = Date.now();
    const day = 1000 * 60 * 60 * 24;
    // Spread the demo drops over the last ~8 weeks for a lively timeline.
    const offsets = [1, 2, 2, 5, 6, 9, 12, 15, 18, 21, 26, 30, 34, 41, 47, 52];
    const dropIds: string[] = [];

    for (let i = 0; i < DEMO_DROPS.length; i++) {
      const demo = DEMO_DROPS[i];
      const savedAt = now - (offsets[i % offsets.length] ?? 1) * day;
      const searchText = (demo.searchText as string) ?? (demo.title as string) ?? "";
      const id = await ctx.db.insert("drops", {
        userId,
        kind: demo.kind as "image" | "screenshot" | "link" | "note" | "document",
        title: demo.title as string,
        summary: demo.summary as string,
        category: demo.category as string,
        subcategory: demo.subcategory as string,
        keywords: (demo.keywords as string[]) ?? [],
        tags: (demo.tags as string[]) ?? [],
        starred: false,
        archived: false,
        savedAt,
        status: "ready",
        analysisStatus: "done",
        analysisVersion: 1,
        confidence: (demo.confidence as number) ?? 0.9,
        url: demo.url as string | undefined,
        text: demo.text as string | undefined,
        searchText,
        source: demo.source as string | undefined,
        entities: (demo.entities as Entity[]) ?? [],
        product: demo.product as never | undefined,
        place: demo.place as never | undefined,
        event: demo.event as never | undefined,
        receipt: demo.receipt as never | undefined,
        reservation: demo.reservation as never | undefined,
        flight: demo.flight as never | undefined,
        intent: demo.intent as string | undefined,
        suggestedAction: demo.suggestedAction as string | undefined,
        suggestedReminder: demo.suggestedReminder as never | undefined,
        embedding: demoEmbedText(searchText),
        embeddingProvider: "demo",
      });
      dropIds.push(id);
    }

    // Seed a few hand-made collections wired to the demo drops.
    const colDefs: Array<{ name: string; emoji: string; dropIndexes: number[] }> = [
      { name: "Tokyo Trip", emoji: "🗼", dropIndexes: [2, 3] },
      { name: "Dream Shoes", emoji: "👟", dropIndexes: [0] },
      { name: "Watch Later", emoji: "🎬", dropIndexes: [5, 9] },
      { name: "Rome Eats", emoji: "🍝", dropIndexes: [1, 10] },
    ];
    for (const col of colDefs) {
      const collectionId = await ctx.db.insert("collections", {
        userId,
        name: col.name,
        emoji: col.emoji,
        isPublic: false,
      });
      for (const idx of col.dropIndexes) {
        if (dropIds[idx]) {
          await ctx.db.insert("collectionDrops", {
            collectionId,
            dropId: dropIds[idx] as never,
            userId,
          });
        }
      }
    }

    return { created: dropIds.length, skipped: false };
  },
});
