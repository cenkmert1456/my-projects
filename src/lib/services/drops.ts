/**
 * dropService — every operation over the `drops` table.
 *
 * Mirrors the old backend API so UI code changes are mechanical. All queries
 * are scoped to the authenticated user id; RLS is the backstop.
 */

import { supabase } from "@/lib/supabase/client";
import type {
  AnalysisStatus,
  Drop,
  DropCounts,
  DropEntity,
  DropKind,
  DropsInsert,
  ProductMeta,
  PlaceMeta,
  EventMeta,
  ReceiptMeta,
  ReservationMeta,
  FlightMeta,
} from "@/lib/supabase/database.types";
import { rowToDrop, rowToDropList, buildSearchText } from "./mappers";
import { analyzeText } from "./analyze";
import { dropEmbedText } from "@/lib/embed";

export const EMBEDDING_PROVIDER = "demo";

function nowMs(): number {
  return Date.now();
}

function isCategory(value: string): boolean {
  return [
    "Products", "Places", "Travel", "Food", "Entertainment", "Documents",
    "Receipts", "Events", "Ideas", "Work", "Study", "People", "Shopping",
    "Reservations", "Tickets", "Finance", "Inspiration", "Other",
  ].includes(value);
}

function guessTitle(input: { kind: string; fileName?: string; url?: string; text?: string }): string {
  if (input.fileName) {
    return input.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 60) || "New drop";
  }
  if (input.url) {
    try {
      return `Saved link — ${new URL(input.url).hostname.replace(/^www\./, "")}`;
    } catch {
      return "Saved link";
    }
  }
  if (input.text) return input.text.slice(0, 48) + (input.text.length > 48 ? "…" : "");
  return "New drop";
}

export interface CreateDropInput {
  kind: DropKind;
  storagePath?: string;
  contentType?: string;
  fileName?: string;
  url?: string;
  text?: string;
  title?: string;
  source?: string;
  saveAnyway?: boolean;
  notes?: string;
}

export interface DropResult {
  duplicate: boolean;
  dropId: string;
  title?: string;
}

export const dropService = {
  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async listRecent(userId: string, limit = 24): Promise<Drop[]> {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .neq("archived", true)
      .is("deleted_at", null)
      .order("saved_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return rowToDropList(data ?? []);
  },

  async listAll(userId: string, includeArchived = false): Promise<Drop[]> {
    let query = supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("saved_at", { ascending: false });
    if (!includeArchived) query = query.neq("archived", true);
    const { data, error } = await query;
    if (error) throw error;
    return rowToDropList(data ?? []);
  },

  async get(userId: string, id: string): Promise<{ drop: Drop; related: Drop[] } | null> {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const drop = rowToDrop(data);
    const { data: sameCategory } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .eq("category", drop.category)
      .neq("archived", true)
      .is("deleted_at", null)
      .neq("id", id)
      .order("saved_at", { ascending: false })
      .limit(6);
    return { drop, related: rowToDropList(sameCategory ?? []) };
  },

  async byCollection(userId: string, collectionId: string): Promise<Drop[]> {
    const { data, error } = await supabase
      .from("drops")
      .select("*, collection_drops!inner(collection_id)")
      .eq("user_id", userId)
      .eq("collection_drops.collection_id", collectionId)
      .neq("archived", true)
      .is("deleted_at", null)
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return rowToDropList(data ?? []);
  },

  async upcoming(userId: string): Promise<Drop[]> {
    const drops = await this.listAll(userId);
    const now = Date.now();
    const withTime = drops.filter(
      (d) =>
        (d.event?.startTime && d.event.startTime > now - 3_600_000) ||
        (d.reservation?.startTime && d.reservation.startTime > now - 3_600_000) ||
        (d.flight?.departureTime && d.flight.departureTime > now - 3_600_000) ||
        (d.receipt?.returnDeadline && d.receipt.returnDeadline > now),
    );
    return withTime.sort((a, b) => {
      const aT = a.event?.startTime ?? a.reservation?.startTime ?? a.flight?.departureTime ?? a.receipt?.returnDeadline ?? 0;
      const bT = b.event?.startTime ?? b.reservation?.startTime ?? b.flight?.departureTime ?? b.receipt?.returnDeadline ?? 0;
      return aT - bT;
    });
  },

  async wishlist(userId: string): Promise<Drop[]> {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .neq("archived", true)
      .is("deleted_at", null)
      .not("product", "is", null)
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return rowToDropList(data ?? []).filter((d) => d.product);
  },

  async places(userId: string): Promise<Drop[]> {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .neq("archived", true)
      .is("deleted_at", null)
      .not("place", "is", null)
      .order("saved_at", { ascending: false });
    if (error) throw error;
    return rowToDropList(data ?? []).filter((d) => d.place);
  },

  async trash(userId: string): Promise<Drop[]> {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return rowToDropList(data ?? []);
  },

  async counts(userId: string): Promise<DropCounts | null> {
    const drops = await this.listAll(userId);
    const byCategory: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const d of drops) {
      byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
      byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
    }
    const now = Date.now();
    return {
      total: drops.length,
      byCategory,
      byKind,
      starred: drops.filter((d) => d.starred).length,
      pinned: drops.filter((d) => d.pinned).length,
      places: drops.filter((d) => d.place).length,
      products: drops.filter((d) => d.product).length,
      upcoming: drops.filter(
        (d) =>
          (d.event?.startTime && d.event.startTime > now) ||
          (d.reservation?.startTime && d.reservation.startTime > now) ||
          (d.flight?.departureTime && d.flight.departureTime > now) ||
          (d.receipt?.returnDeadline && d.receipt.returnDeadline > now),
      ).length,
      needsReview: drops.filter((d) => d.status === "needs_review" || d.status === "failed").length,
      processing: drops.filter((d) => d.status === "processing").length,
      documents: drops.filter((d) => d.kind === "document").length,
      screenshots: drops.filter((d) => d.kind === "screenshot" || d.kind === "image").length,
      links: drops.filter((d) => d.kind === "link").length,
      notes: drops.filter((d) => d.kind === "note").length,
    };
  },

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async create(userId: string, args: CreateDropInput): Promise<DropResult> {
    if (args.kind === "link" && !args.url) throw new Error("A link Drop needs a URL");
    if (args.kind === "note" && !args.text) throw new Error("A note Drop needs text");
    if (
      (args.kind === "image" || args.kind === "screenshot" || args.kind === "document") &&
      !args.storagePath
    ) {
      throw new Error("Upload the file first");
    }

    if (args.url && !args.saveAnyway) {
      const normalized = args.url.trim();
      const { data: existing } = await supabase
        .from("drops")
        .select("id, title")
        .eq("user_id", userId)
        .eq("url", normalized)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) {
        return { duplicate: true, dropId: existing.id, title: existing.title ?? undefined };
      }
    }

    const title = args.title?.trim() || guessTitle(args);
    const now = nowMs();

    // Zero-config understanding: deterministic analysis runs inline (no server
    // action, no keys). Native devices upgrade this with OCR + on-device AI via
    // attachOcr / attachAnalysis.
    const analysis = analyzeText({
      kind: args.kind,
      text: args.text,
      url: args.url,
      fileName: args.fileName,
      title,
    });

    const searchText = buildSearchText({
      title: analysis.title,
      summary: args.kind === "note" ? args.text : analysis.summary,
      keywords: analysis.keywords,
      tags: [],
      text: args.text,
      notes: args.notes,
      category: analysis.category,
      subcategory: analysis.subcategory,
      url: args.url,
      source: args.source,
      entities: analysis.entities,
    });

    const { data, error } = await supabase
      .from("drops")
      .insert({
        user_id: userId,
        kind: args.kind,
        title: analysis.title,
        summary: args.kind === "note" ? args.text : analysis.summary,
        category: analysis.category,
        subcategory: analysis.subcategory,
        keywords: analysis.keywords,
        tags: [],
        starred: false,
        archived: false,
        pinned: false,
        sensitive: false,
        notes: args.notes,
        saved_at: now,
        status: "ready",
        analysis_status: "done",
        analysis_version: 1,
        confidence: analysis.confidence,
        url: args.url?.trim(),
        text: args.text,
        storage_path: args.storagePath,
        content_type: args.contentType,
        file_name: args.fileName,
        source: args.source,
        entities: analysis.entities,
        suggested_action: analysis.suggestedAction,
        search_text: searchText,
        embedding: analysis.embedding,
        embedding_provider: EMBEDDING_PROVIDER,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new Error("Could not save drop");

    return { duplicate: false, dropId: data.id };
  },

  async update(
    userId: string,
    id: string,
    patch: {
      title?: string;
      summary?: string;
      category?: string;
      subcategory?: string;
      text?: string;
      url?: string;
      tags?: string[];
    },
  ): Promise<Drop | null> {
    if (patch.category && !isCategory(patch.category)) throw new Error("Unknown category");
    const current = await this.get(userId, id);
    if (!current) return null;
    const next = { ...current.drop, ...patch };
    const searchText = buildSearchText({
      title: next.title,
      summary: next.summary,
      keywords: next.keywords,
      tags: patch.tags ?? next.tags,
      text: next.text,
      ocrText: next.ocrText,
      category: next.category,
      subcategory: next.subcategory,
      url: next.url,
      source: next.source,
      entities: next.entities,
    });
    const { data, error } = await supabase
      .from("drops")
      .update({ ...patch, search_text: searchText })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async setCategory(userId: string, id: string, category: string): Promise<Drop | null> {
    if (!isCategory(category)) throw new Error("Unknown category");
    const current = await this.get(userId, id);
    if (!current) return null;
    const drop = current.drop;
    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags: drop.tags,
      text: drop.text,
      ocrText: drop.ocrText,
      category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });
    const { data, error } = await supabase
      .from("drops")
      .update({ category, search_text: searchText })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async toggleStar(userId: string, id: string): Promise<Drop | null> {
    return this.toggleFlag(userId, id, "starred");
  },
  async toggleArchive(userId: string, id: string): Promise<Drop | null> {
    return this.toggleFlag(userId, id, "archived");
  },
  async togglePin(userId: string, id: string): Promise<Drop | null> {
    return this.toggleFlag(userId, id, "pinned");
  },
  async toggleSensitive(userId: string, id: string): Promise<Drop | null> {
    return this.toggleFlag(userId, id, "sensitive");
  },

  async toggleFlag(
    userId: string,
    id: string,
    flag: "starred" | "archived" | "pinned" | "sensitive",
  ): Promise<Drop | null> {
    const { data: row } = await supabase
      .from("drops")
      .select("id, starred, archived, pinned, sensitive")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return null;
    const next: Partial<DropsInsert> = { ...row };
    if (flag === "starred") next.starred = !row.starred;
    else if (flag === "archived") next.archived = !row.archived;
    else if (flag === "pinned") next.pinned = !row.pinned;
    else next.sensitive = !row.sensitive;
    const { data, error } = await supabase
      .from("drops")
      .update(next)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async setNotes(userId: string, id: string, notes: string | null): Promise<Drop | null> {
    const { data, error } = await supabase
      .from("drops")
      .update({ notes })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async addTag(userId: string, id: string, tag: string): Promise<Drop | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const tags = current.drop.tags.includes(tag) ? current.drop.tags : [...current.drop.tags, tag];
    return this.update(userId, id, { tags });
  },

  async removeTag(userId: string, id: string, tag: string): Promise<Drop | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const tags = current.drop.tags.filter((t) => t !== tag);
    return this.update(userId, id, { tags });
  },

  async softRemove(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from("drops")
      .update({ deleted_at: nowMs(), archived: false })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async restore(userId: string, id: string): Promise<Drop | null> {
    const { data, error } = await supabase
      .from("drops")
      .update({ deleted_at: null })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async deletePermanently(userId: string, id: string): Promise<void> {
    const { data } = await supabase
      .from("drops")
      .select("storage_path, thumbnail_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.storage_path || data?.thumbnail_path) {
      const { storageService } = await import("./storage");
      await storageService.remove(
        [data.storage_path, data.thumbnail_path].filter((p): p is string => Boolean(p)),
      );
    }
    // FK cascade removes collection/stack links, reminders and activities.
    const { error } = await supabase.from("drops").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  },

  async emptyTrash(userId: string): Promise<void> {
    const rows = await this.trash(userId);
    for (const drop of rows) {
      await this.deletePermanently(userId, drop.id);
    }
  },

  async bulkAction(
    userId: string,
    dropIds: string[],
    action: "delete" | "archive" | "restore" | "star",
  ): Promise<void> {
    if (!dropIds.length) return;
    const patch =
      action === "delete"
        ? { deleted_at: nowMs() }
        : action === "archive"
          ? { archived: true }
          : action === "restore"
            ? { deleted_at: null, archived: false }
            : { starred: true };
    const { error } = await supabase.from("drops").update(patch).in("id", dropIds).eq("user_id", userId);
    if (error) throw error;
  },

  /** Re-run the zero-config analysis over stored content (no image needed). */
  async retryAnalysis(userId: string, id: string): Promise<Drop | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const drop = current.drop;
    const analysis = analyzeText({
      kind: drop.kind,
      text: drop.text,
      ocrText: drop.ocrText,
      url: drop.url,
      fileName: drop.fileName,
      title: drop.title,
    });
    const searchText = buildSearchText({
      title: analysis.title,
      summary: drop.summary ?? analysis.summary,
      keywords: analysis.keywords,
      tags: drop.tags,
      text: drop.text,
      ocrText: drop.ocrText,
      category: analysis.category,
      subcategory: analysis.subcategory,
      url: drop.url,
      source: drop.source,
      entities: [...drop.entities, ...analysis.entities],
    });
    const { data, error } = await supabase
      .from("drops")
      .update({
        title: drop.title || analysis.title,
        category: analysis.category,
        subcategory: analysis.subcategory,
        keywords: [...new Set([...drop.keywords, ...analysis.keywords])],
        entities: [...drop.entities, ...analysis.entities].slice(0, 12),
        suggested_action: analysis.suggestedAction ?? drop.suggestedAction,
        status: "ready",
        analysis_status: "done",
        analysis_version: (drop.analysisVersion ?? 0) + 1,
        confidence: analysis.confidence,
        search_text: searchText,
        embedding: analysis.embedding,
        embedding_provider: EMBEDDING_PROVIDER,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  // -------------------------------------------------------------------------
  // On-device intelligence attachments (native pipeline → DB)
  // -------------------------------------------------------------------------

  async attachOcr(
    userId: string,
    id: string,
    params: { text: string; language?: string; engine?: string },
  ): Promise<Drop | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const drop = current.drop;
    const searchText = buildSearchText({
      title: drop.title,
      summary: drop.summary,
      keywords: drop.keywords,
      tags: drop.tags,
      text: drop.text,
      ocrText: params.text,
      category: drop.category,
      subcategory: drop.subcategory,
      url: drop.url,
      source: drop.source,
      entities: drop.entities,
    });
    const { data, error } = await supabase
      .from("drops")
      .update({
        ocr_text: params.text,
        ocr_language: params.language,
        ocr_engine: params.engine ?? "drop-ai",
        search_text: searchText,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async attachEmbedding(
    userId: string,
    id: string,
    params: { embedding: number[]; provider?: string },
  ): Promise<Drop | null> {
    const { data, error } = await supabase
      .from("drops")
      .update({
        embedding: params.embedding,
        embedding_provider: params.provider ?? EMBEDDING_PROVIDER,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },

  async attachAnalysis(
    userId: string,
    id: string,
    analysis: {
      title?: string;
      summary?: string;
      category?: string;
      subcategory?: string;
      keywords?: string[];
      tags?: string[];
      ocrSummary?: string;
      products?: string[];
      brands?: string[];
      places?: string[];
      peopleMentioned?: string[];
      dates?: string[];
      prices?: string[];
      currency?: string;
      events?: string[];
      actions?: string[];
      confidence?: number;
      language?: string;
      visualDescription?: string;
    },
  ): Promise<Drop | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const drop = current.drop;

    const entities: DropEntity[] = [];
    const push = (type: string, values: string[] | undefined, confidence: number) => {
      for (const v of values ?? []) {
        if (v) entities.push({ type, value: v.slice(0, 120), confidence });
      }
    };
    push("product", analysis.products, 0.85);
    push("brand", analysis.brands, 0.85);
    push("place", analysis.places, 0.8);
    push("person", analysis.peopleMentioned, 0.7);
    push("date", analysis.dates, 0.75);
    push("price", analysis.prices, 0.8);
    push("event", analysis.events, 0.8);

    const category = analysis.category ?? drop.category;
    const subcategory = analysis.subcategory ?? drop.subcategory;
    const keywords = [...new Set([...drop.keywords, ...(analysis.keywords ?? [])])].slice(0, 16);
    const tags = [...new Set([...(analysis.tags ?? []), ...drop.tags])].slice(0, 12);
    const title = analysis.title?.trim() || drop.title;
    const summary = analysis.summary?.trim() || drop.summary;

    const product: ProductMeta | null | undefined = drop.product;
    const place: PlaceMeta | null | undefined = drop.place;
    const event: EventMeta | null | undefined = drop.event;
    const receipt: ReceiptMeta | null | undefined = drop.receipt;
    const reservation: ReservationMeta | null | undefined = drop.reservation;
    const flight: FlightMeta | null | undefined = drop.flight;

    if (analysis.products?.length && !product?.name) {
      // shallow product heuristic from the native analysis
      const firstProduct = analysis.products[0];
      const priceStr = analysis.prices?.[0];
      const priceNum = priceStr ? Number(priceStr.replace(/[^\d.,]/g, "").replace(",", ".")) : undefined;
      const currentProduct = product ?? {};
      Object.assign(currentProduct, {
        name: firstProduct,
        currency: priceStr ? guessCurrency(priceStr) : analysis.currency,
        price: Number.isFinite(priceNum) ? priceNum : undefined,
      });
    }
    if (analysis.places?.length && !place?.name) {
      const currentPlace = place ?? {};
      Object.assign(currentPlace, { name: analysis.places[0], city: findCity(analysis.places) });
    }
    if (analysis.events?.length && !event?.name) {
      const currentEvent = event ?? {};
      Object.assign(currentEvent, { name: analysis.events[0] });
    }

    const searchText = buildSearchText({
      title,
      summary,
      keywords,
      tags,
      text: drop.text,
      ocrText: analysis.ocrSummary ?? drop.ocrText,
      category,
      subcategory,
      url: drop.url,
      source: drop.source,
      entities,
    });

    const { data, error } = await supabase
      .from("drops")
      .update({
        title,
        summary,
        category,
        subcategory,
        keywords,
        tags,
        entities: [...drop.entities, ...entities].slice(0, 24),
        product,
        place,
        event,
        receipt,
        reservation,
        flight,
        language: analysis.language ?? drop.language,
        suggested_action: analysis.actions?.[0] ?? drop.suggestedAction,
        confidence: analysis.confidence ?? drop.confidence,
        status: "ready",
        analysis_status: "done",
        analysis_version: (drop.analysisVersion ?? 0) + 1,
        search_text: searchText,
        embedding: drop.embedding ?? (analysis.ocrSummary ? dropEmbedText(analysis.ocrSummary) : undefined),
        embedding_provider: drop.embedding ? drop.embeddingProvider : EMBEDDING_PROVIDER,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDrop(data) : null;
  },
};

// Small helpers kept out of the mapper to keep types tidy.
function guessCurrency(price: string): string | undefined {
  if (price.includes("€")) return "EUR";
  if (price.includes("$")) return "USD";
  if (price.includes("£")) return "GBP";
  if (price.includes("¥")) return "JPY";
  if (price.includes("₺")) return "TRY";
  return undefined;
}
function findCity(places: string[]): string | undefined {
  return places.find((p) => p.length < 30);
}
