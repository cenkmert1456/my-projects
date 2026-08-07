// Internal-only helpers used by the analyze action (an action cannot call
// itself, and "use node" files cannot define queries/mutations).

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { DropStatus, AnalysisStatus } from "./lib/constants";

export const getDropById = internalQuery({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    return await ctx.db.get(dropId);
  },
});

export const patchDropAnalysisState = internalMutation({
  args: {
    dropId: v.id("drops"),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("needs_review"),
      v.literal("failed"),
    ),
    analysisStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { dropId, status, analysisStatus }) => {
    await ctx.db.patch(dropId, { status, analysisStatus });
  },
});

export const patchDropAnalysisResult = internalMutation({
  args: {
    dropId: v.id("drops"),
    result: v.any(),
  },
  handler: async (ctx, { dropId, result }) => {
    await ctx.db.patch(dropId, result);
  },
});

/** All drops for a user, newest first (used by the search action). */
export const getDropsByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("drops")
      .withIndex("by_user_savedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getCollectionDropIds = internalQuery({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) => {
    const links = await ctx.db
      .query("collectionDrops")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .collect();
    return links.map((l) => l.dropId);
  },
});

export const getUserDoc = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export type { DropStatus, AnalysisStatus };
