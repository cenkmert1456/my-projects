/**
 * reminderService — persisted reminder state in Supabase.
 *
 * Mobile local notifications remain fully handled by Capacitor (see
 * src/lib/mobile); this service owns the durable state so reminders survive
 * reinstall / device change and are queryable on the web.
 */

import { supabase } from "@/lib/supabase/client";
import type { Reminder } from "@/lib/supabase/database.types";
import { rowToReminder } from "./mappers";

export const reminderService = {
  /** Upcoming (pending) reminders, nearest first. */
  async listUpcoming(userId: string, limit = 60): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from("reminders")
      .select("*, drops(title)")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("remind_at", 0)
      .order("remind_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...rowToReminder(row as never),
      dropTitle: (row as { drops?: { title: string } | null }).drops?.title,
    }));
  },

  async listForDrop(userId: string, dropId: string): Promise<Reminder[]> {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .eq("drop_id", dropId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToReminder);
  },

  async create(
    userId: string,
    input: { dropId: string; text: string; remindAt: number },
  ): Promise<Reminder> {
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        user_id: userId,
        drop_id: input.dropId,
        text: input.text,
        remind_at: input.remindAt,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw error;
    return rowToReminder(data);
  },

  async complete(userId: string, id: string): Promise<Reminder | null> {
    return this.setStatus(userId, id, "completed");
  },

  async dismiss(userId: string, id: string): Promise<Reminder | null> {
    return this.setStatus(userId, id, "dismissed");
  },

  async setStatus(
    userId: string,
    id: string,
    status: "pending" | "completed" | "dismissed",
  ): Promise<Reminder | null> {
    const { data, error } = await supabase
      .from("reminders")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToReminder(data) : null;
  },

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },
};
