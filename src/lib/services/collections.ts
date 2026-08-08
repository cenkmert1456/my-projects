/**
 * collectionService — collections + collection_drops + public sharing.
 */

import { supabase } from "@/lib/supabase/client";
import type { Collection, CollectionWithCount, CollectionsInsert, Drop } from "@/lib/supabase/database.types";
import { collectionWithCount, rowToCollection } from "./mappers";
import { dropService } from "./drops";

function randomToken(): string {
  return Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

export const collectionService = {
  async list(userId: string): Promise<CollectionWithCount[]> {
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: links } = await supabase
      .from("collection_drops")
      .select("collection_id")
      .eq("user_id", userId);
    const byCollection: Record<string, number> = {};
    for (const link of links ?? []) {
      byCollection[link.collection_id] = (byCollection[link.collection_id] ?? 0) + 1;
    }
    return (data ?? []).map((row) => collectionWithCount(row, byCollection[row.id] ?? 0));
  },

  async get(userId: string, collectionId: string): Promise<{ collection: Collection; drops: Drop[] } | null> {
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("id", collectionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const drops = await dropService.byCollection(userId, collectionId);
    return { collection: rowToCollection(data), drops };
  },

  /** Collections a drop belongs to. */
  async withDrop(userId: string, dropId: string): Promise<Collection[]> {
    const { data, error } = await supabase
      .from("collection_drops")
      .select("collections(*)")
      .eq("user_id", userId)
      .eq("drop_id", dropId);
    if (error) throw error;
    return (data ?? [])
      .map((d) => (d.collections ? rowToCollection(d.collections) : null))
      .filter((c): c is Collection => Boolean(c));
  },

  async create(
    userId: string,
    input: { name: string; emoji?: string; color?: string; description?: string; isPublic?: boolean },
  ): Promise<Collection> {
    const { data, error } = await supabase
      .from("collections")
      .insert({
        user_id: userId,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        description: input.description,
        is_public: input.isPublic ?? false,
        share_token: input.isPublic ? randomToken() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return rowToCollection(data);
  },

  async update(
    userId: string,
    collectionId: string,
    patch: {
      name?: string;
      emoji?: string;
      color?: string;
      description?: string;
      isPublic?: boolean;
    },
  ): Promise<Collection | null> {
    const next: Partial<CollectionsInsert> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.emoji !== undefined) next.emoji = patch.emoji;
    if (patch.color !== undefined) next.color = patch.color;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.isPublic !== undefined) {
      next.is_public = patch.isPublic;
      if (patch.isPublic) next.share_token = randomToken();
    }
    const { data, error } = await supabase
      .from("collections")
      .update(next)
      .eq("id", collectionId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToCollection(data) : null;
  },

  async remove(userId: string, collectionId: string): Promise<void> {
    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("id", collectionId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async addDrop(userId: string, collectionId: string, dropId: string): Promise<void> {
    const { error } = await supabase
      .from("collection_drops")
      .insert({ collection_id: collectionId, drop_id: dropId, user_id: userId });
    if (error && !error.message.includes("duplicate")) throw error;
  },

  async removeDrop(userId: string, collectionId: string, dropId: string): Promise<void> {
    const { error } = await supabase
      .from("collection_drops")
      .delete()
      .eq("collection_id", collectionId)
      .eq("drop_id", dropId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  /** Read a public collection by token (sharing). */
  async getPublicByToken(token: string): Promise<Collection | null> {
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("share_token", token)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToCollection(data) : null;
  },
};
