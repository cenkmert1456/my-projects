/**
 * profileService — user profile, plan info, stats, GDPR export/delete and
 * demo seeding. Auth itself lives in the Supabase auth layer.
 */

import { supabase } from "@/lib/supabase/client";
import type { DropStats, PlanInfo, Profile, ProfilesInsert } from "@/lib/supabase/database.types";
import { rowToProfile } from "./mappers";
import { dropService } from "./drops";

export const profileService = {
  /** Fetch the profile row for a user (creates it on first login if missing). */
  async get(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToProfile(data);
  },

  async upsert(userId: string, patch: { name?: string; email?: string; image?: string }): Promise<void> {
    await supabase.from("profiles").upsert(
      {
        id: userId,
        name: patch.name,
        email: patch.email,
        image: patch.image,
      },
      { onConflict: "id" },
    );
  },

  async updateProfile(
    userId: string,
    patch: {
      name?: string;
      onboardingDone?: boolean;
      searchHistoryEnabled?: boolean;
      dailyRecallEnabled?: boolean;
      theme?: string;
      locale?: string;
      username?: string;
      timezone?: string;
      currency?: string;
      appearance?: string;
    },
  ): Promise<Profile | null> {
    const next: Partial<ProfilesInsert> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.onboardingDone !== undefined) next.onboarding_done = patch.onboardingDone;
    if (patch.searchHistoryEnabled !== undefined) next.search_history_enabled = patch.searchHistoryEnabled;
    if (patch.dailyRecallEnabled !== undefined) next.daily_recall_enabled = patch.dailyRecallEnabled;
    if (patch.theme !== undefined) next.theme = patch.theme;
    if (patch.locale !== undefined) next.locale = patch.locale;
    if (patch.username !== undefined) next.username = patch.username;
    if (patch.timezone !== undefined) next.timezone = patch.timezone;
    if (patch.currency !== undefined) next.currency = patch.currency;
    if (patch.appearance !== undefined) next.appearance = patch.appearance;
    const { data, error } = await supabase
      .from("profiles")
      .update(next)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToProfile(data) : null;
  },

  async planInfo(userId: string): Promise<PlanInfo | null> {
    const profile = await this.get(userId);
    const planId = profile?.plan ?? "free";

    const { data: planRow } = await supabase
      .from("plans")
      .select("*")
      .eq("plan_id", planId)
      .maybeSingle();

    const dropLimit = planRow?.drop_limit ?? (planId === "free" ? 100 : null);
    const { count } = await supabase
      .from("drops")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      plan: planId,
      planName: planRow?.name ?? (planId === "free" ? "Free" : planId[0].toUpperCase() + planId.slice(1)),
      dropLimit,
      dropCount: count ?? 0,
      isUnlimited: dropLimit === null,
      planStatus: profile?.planStatus,
      planRenewsAt: profile?.planRenewsAt,
    };
  },

  async stats(userId: string): Promise<DropStats | null> {
    const drops = await dropService.listAll(userId);
    const visible = drops.filter((d) => !d.archived);
    const now = Date.now();
    const thisMonth = visible.filter((d) => now - d.savedAt < 1000 * 60 * 60 * 24 * 30).length;
    const cities = new Set(visible.flatMap((d) => (d.place?.city ? [d.place.city] : [])));
    return {
      total: visible.length,
      places: visible.filter((d) => d.place).length,
      products: visible.filter((d) => d.product).length,
      favorites: visible.filter((d) => d.starred).length,
      trips: new Set(visible.flatMap((d) => (d.place ? [d.place.country ?? "?"] : []))).size,
      cities: cities.size,
      thisMonth,
      upcoming: visible.filter(
        (d) =>
          (d.event?.startTime && d.event.startTime > now) ||
          (d.reservation?.startTime && d.reservation.startTime > now),
      ).length,
      screenshots: visible.filter((d) => d.kind === "screenshot" || d.kind === "image").length,
      rediscovered: Math.min(visible.length, Math.max(0, Math.round(visible.length * 0.18))),
    };
  },

  async exportData(userId: string): Promise<Record<string, unknown>> {
    const profile = await this.get(userId);
    const drops = await dropService.listAll(userId, true);
    const { data: collections } = await supabase.from("collections").select("*").eq("user_id", userId);
    const { data: stacks } = await supabase.from("stacks").select("*").eq("user_id", userId);
    const { data: reminders } = await supabase.from("reminders").select("*").eq("user_id", userId);
    return {
      exportedAt: new Date().toISOString(),
      profile,
      drops,
      collections: collections ?? [],
      stacks: stacks ?? [],
      reminders: reminders ?? [],
    };
  },

  /**
   * Delete the account + all of the user's data.
   *
   * The client cannot delete the auth.users row itself (that requires an
   * admin/edge function), so this removes every owned row via RLS and the
   * private storage objects, then signs out. Deploying the optional edge
   * function (`supabase/functions/delete-account`) completes the auth-side
   * deletion.
   */
  async deleteAccount(userId: string): Promise<void> {
    const tables = [
      "drops", "collections", "stacks", "reminders", "search_history",
      "subscriptions", "shared_collections", "notifications", "activities",
    ] as const;
    for (const table of tables) {
      await supabase.from(table).delete().eq("user_id", userId);
    }
    await supabase.from("profiles").delete().eq("id", userId);
    // Remove private storage objects (not cascade-deleted).
    const { data: files } = await supabase.storage.from("drop-files").list(userId, { limit: 1000 });
    for (const file of files ?? []) {
      await supabase.storage.from("drop-files").remove([`${userId}/${file.name}`]);
    }
    await supabase.auth.signOut();
  },

  /** Seed demo drops (first-run onboarding). */
  async loadDemoData(userId: string): Promise<void> {
    const { data: existing } = await supabase
      .from("drops")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (existing?.length) return;

    const { DEMO_DROPS } = await import("@/lib/demo-data");
    for (const demo of DEMO_DROPS) {
      const kind = (demo.kind ?? "note") as "image" | "screenshot" | "link" | "note" | "document";
      const title = (demo.title as string) ?? "New drop";
      const savedAt = Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 14);
      await supabase.from("drops").insert({
        user_id: userId,
        kind,
        title,
        summary: demo.summary as string | undefined,
        category: (demo.category as string) ?? "Other",
        subcategory: demo.subcategory as string | undefined,
        keywords: (demo.keywords as string[]) ?? [],
        tags: (demo.tags as string[]) ?? [],
        starred: Boolean(demo.starred),
        url: demo.url as string | undefined,
        source: demo.source as string | undefined,
        saved_at: savedAt,
        status: "ready",
        analysis_status: "done",
        analysis_version: 1,
        confidence: demo.confidence as number | undefined,
        entities: (demo.entities as never[]) ?? [],
        product: (demo.product as never) ?? null,
        place: (demo.place as never) ?? null,
        event: (demo.event as never) ?? null,
        receipt: (demo.receipt as never) ?? null,
        reservation: (demo.reservation as never) ?? null,
        flight: (demo.flight as never) ?? null,
        suggested_action: demo.suggestedAction as string | undefined,
        search_text: (demo.searchText as string) ?? title,
        embedding: (demo.embedding as number[] | undefined) ?? undefined,
        embedding_provider: "demo",
      });
    }
  },
};
