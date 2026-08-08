/**
 * activityService — lightweight history (saved, edited, starred, archived…).
 * notificationService — in-app notifications.
 */

import { supabase } from "@/lib/supabase/client";
import { rowToActivity } from "./mappers";

export const activityService = {
  async list(userId: string, limit = 40): Promise<ReturnType<typeof rowToActivity>[]> {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToActivity);
  },

  async log(userId: string, action: string, dropId?: string, detail?: string): Promise<void> {
    await supabase.from("activities").insert({
      user_id: userId,
      drop_id: dropId ?? null,
      action,
      detail: detail ?? null,
      at: Date.now(),
    });
  },
};

export const notificationService = {
  async list(userId: string, limit = 30): Promise<
    Array<{ id: string; type: string; title: string; body?: string; read: boolean; createdAt: number; dropId?: string }>
  > {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body ?? undefined,
      read: n.read,
      createdAt: n.created_at,
      dropId: n.drop_id ?? undefined,
    }));
  },

  async markRead(userId: string, id: string): Promise<void> {
    await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", userId);
  },

  async markAllRead(userId: string): Promise<void> {
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).is("read", false);
  },

  async remove(userId: string, id: string): Promise<void> {
    await supabase.from("notifications").delete().eq("id", id).eq("user_id", userId);
  },
};
