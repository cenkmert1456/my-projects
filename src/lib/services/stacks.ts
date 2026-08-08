/**
 * stackService — stacks + stack_drops. Stacks are short/medium-term research
 * groups ("Japan 2027", "New Gaming PC"), distinct from long-term collections.
 */

import { supabase } from "@/lib/supabase/client";
import type { Drop, Stack, StackWithDrops } from "@/lib/supabase/database.types";
import { rowToDropList, rowToStack } from "./mappers";

export const stackService = {
  async list(userId: string): Promise<StackWithDrops[]> {
    const { data, error } = await supabase
      .from("stacks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const stacks = (data ?? []).map(rowToStack);

    const withCounts = await Promise.all(
      stacks.map(async (stack) => {
        const { data: links } = await supabase
          .from("stack_drops")
          .select("drop_id")
          .eq("stack_id", stack.id)
          .eq("user_id", userId);
        const dropIds = (links ?? []).map((l) => l.drop_id);
        const drops = await this.dropsOf(userId, dropIds);
        return { stack, count: drops.length, drops: drops.slice(0, 3) };
      }),
    );
    return withCounts.sort((a, b) => b.stack.createdAt - a.stack.createdAt);
  },

  async get(userId: string, id: string): Promise<{ stack: Stack; drops: Drop[] } | null> {
    const { data, error } = await supabase
      .from("stacks")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { data: links } = await supabase
      .from("stack_drops")
      .select("drop_id")
      .eq("stack_id", id)
      .eq("user_id", userId);
    const drops = await this.dropsOf(userId, (links ?? []).map((l) => l.drop_id));
    return { stack: rowToStack(data), drops };
  },

  async create(
    userId: string,
    input: { name: string; emoji?: string; description?: string; dropIds?: string[] },
  ): Promise<Stack> {
    const { data, error } = await supabase
      .from("stacks")
      .insert({
        user_id: userId,
        name: input.name,
        emoji: input.emoji,
        description: input.description,
      })
      .select("*")
      .single();
    if (error) throw error;
    const stack = rowToStack(data);
    for (const dropId of input.dropIds ?? []) {
      await this.addDrop(userId, stack.id, dropId);
    }
    return stack;
  },

  async update(
    userId: string,
    id: string,
    patch: { name?: string; emoji?: string; description?: string },
  ): Promise<Stack | null> {
    const { data, error } = await supabase
      .from("stacks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToStack(data) : null;
  },

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from("stacks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async addDrop(userId: string, stackId: string, dropId: string): Promise<void> {
    const { error } = await supabase
      .from("stack_drops")
      .insert({ stack_id: stackId, drop_id: dropId, user_id: userId });
    if (error && !error.message.includes("duplicate")) throw error;
  },

  async removeDrop(userId: string, stackId: string, dropId: string): Promise<void> {
    const { error } = await supabase
      .from("stack_drops")
      .delete()
      .eq("stack_id", stackId)
      .eq("drop_id", dropId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  /** Stacks containing a drop (used by DropDetail). */
  async forDrop(userId: string, dropId: string): Promise<Stack[]> {
    const { data, error } = await supabase
      .from("stack_drops")
      .select("stacks(*)")
      .eq("user_id", userId)
      .eq("drop_id", dropId);
    if (error) throw error;
    return (data ?? [])
      .map((d) => (d.stacks ? rowToStack(d.stacks) : null))
      .filter((s): s is Stack => Boolean(s));
  },

  async dropsOf(userId: string, dropIds: string[]): Promise<Drop[]> {
    if (!dropIds.length) return [];
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .neq("archived", true)
      .in("id", dropIds)
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return rowToDropList(data ?? []);
  },
};
