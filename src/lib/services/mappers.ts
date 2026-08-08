/**
 * Mappers between Supabase rows (snake_case) and the application model
 * (camelCase) + the shared search-text builder (ported from the old backend
 * so search behaviour is preserved exactly).
 */

import type {
  ActivitiesRow,
  Collection,
  CollectionsRow,
  CollectionWithCount,
  Drop,
  DropEntity,
  DropsRow,
  EventMeta,
  FlightMeta,
  Json,
  PlaceMeta,
  ProductMeta,
  Profile,
  ProfilesRow,
  ReceiptMeta,
  Reminder,
  RemindersRow,
  ReservationMeta,
  SearchHistory,
  SearchHistoryRow,
  Stack,
  StacksRow,
  SuggestedReminderMeta,
} from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Generic JSON helpers
// ---------------------------------------------------------------------------

function asStringArray(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asEntities(value: Json | null | undefined): DropEntity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const e = v as Record<string, unknown>;
    if (typeof e.value !== "string") return [];
    return [
      {
        type: typeof e.type === "string" ? e.type : "",
        value: e.value,
        confidence: typeof e.confidence === "number" ? e.confidence : 0,
        metadata:
          e.metadata && typeof e.metadata === "object"
            ? (e.metadata as Record<string, string>)
            : undefined,
      },
    ];
  });
}

function asJson<T>(value: Json | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value as T;
  return undefined;
}

function asNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

// ---------------------------------------------------------------------------
// drops
// ---------------------------------------------------------------------------

export function rowToDrop(row: DropsRow): Drop {
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id,
    kind: row.kind as Drop["kind"],
    title: row.title,
    summary: row.summary ?? undefined,
    category: row.category,
    subcategory: row.subcategory ?? undefined,
    keywords: asStringArray(row.keywords),
    tags: asStringArray(row.tags),
    starred: row.starred,
    archived: row.archived,
    pinned: row.pinned,
    sensitive: row.sensitive,
    locked: row.locked,
    notes: row.notes ?? undefined,
    deletedAt: asNumber(row.deleted_at),
    savedAt: row.saved_at,
    description: row.description ?? undefined,
    documentMetadata: asJson<Record<string, unknown>>(row.document_metadata),
    aiMetadata: asJson<Record<string, unknown>>(row.ai_metadata),
    status: row.status as Drop["status"],
    analysisStatus: row.analysis_status as Drop["analysisStatus"],
    analysisVersion: asNumber(row.analysis_version),
    confidence: asNumber(row.confidence),
    url: row.url ?? undefined,
    text: row.text ?? undefined,
    ocrText: row.ocr_text ?? undefined,
    ocrLanguage: row.ocr_language ?? undefined,
    ocrEngine: row.ocr_engine ?? undefined,
    searchText: row.search_text ?? undefined,
    source: row.source ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    storageId: row.storage_path ?? undefined,
    thumbnailPath: row.thumbnail_path ?? undefined,
    contentType: row.content_type ?? undefined,
    fileName: row.file_name ?? undefined,
    language: row.language ?? undefined,
    sentiment: row.sentiment ?? undefined,
    intent: row.intent ?? undefined,
    entities: asEntities(row.entities),
    product: asJson<ProductMeta>(row.product),
    place: asJson<PlaceMeta>(row.place),
    event: asJson<EventMeta>(row.event),
    receipt: asJson<ReceiptMeta>(row.receipt),
    reservation: asJson<ReservationMeta>(row.reservation),
    flight: asJson<FlightMeta>(row.flight),
    suggestedAction: row.suggested_action ?? undefined,
    suggestedReminder: asJson<SuggestedReminderMeta>(row.suggested_reminder),
    embedding: row.embedding ?? undefined,
    embeddingProvider: row.embedding_provider ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDropList(rows: DropsRow[]): Drop[] {
  return rows.map(rowToDrop);
}

// ---------------------------------------------------------------------------
// collections / stacks / reminders / profile / search history
// ---------------------------------------------------------------------------

export function rowToCollection(row: CollectionsRow): Collection {
  return {
    _id: row.id,
    id: row.id,
    userId: row.user_id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    color: row.color ?? undefined,
    description: row.description ?? undefined,
    isPublic: row.is_public,
    shareToken: row.share_token ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function collectionWithCount(
  row: CollectionsRow,
  dropCount: number,
): CollectionWithCount {
  return { ...rowToCollection(row), dropCount };
}

export function rowToStack(row: StacksRow): Stack {
  return {
    _id: row.id,
    id: row.id,
    userId: row.user_id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    color: row.color ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToReminder(row: RemindersRow): Reminder {
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id,
    dropId: row.drop_id,
    text: row.text,
    remindAt: row.remind_at,
    status: row.status as Reminder["status"],
    completedAt: asNumber(row.completed_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToProfile(row: ProfilesRow): Profile {
  return {
    id: row.id,
    name: row.name ?? undefined,
    image: row.image ?? undefined,
    email: row.email ?? undefined,
    role: row.role,
    onboardingDone: row.onboarding_done,
    plan: row.plan,
    planStatus: row.plan_status ?? undefined,
    planRenewsAt: asNumber(row.plan_renews_at),
    searchHistoryEnabled: row.search_history_enabled,
    dailyRecallEnabled: row.daily_recall_enabled,
    locale: row.locale ?? undefined,
    theme: row.theme ?? undefined,
    onboardedAt: asNumber(row.onboarded_at),
    username: row.username ?? undefined,
    timezone: row.timezone ?? undefined,
    currency: row.currency ?? undefined,
    appearance: row.appearance ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSearchHistory(row: SearchHistoryRow): SearchHistory {
  return {
    id: row.id,
    _id: row.id,
    userId: row.user_id,
    query: row.query,
    resultCount: asNumber(row.result_count),
    createdAt: row.created_at,
  };
}

export function rowToActivity(row: ActivitiesRow) {
  return {
    id: row.id,
    userId: row.user_id,
    dropId: row.drop_id ?? undefined,
    action: row.action,
    detail: row.detail ?? undefined,
    at: row.at,
  };
}

// ---------------------------------------------------------------------------
// Search text (ported verbatim from the old backend helper)
// ---------------------------------------------------------------------------

export function buildSearchText(input: {
  title: string;
  summary?: string;
  keywords?: string[];
  tags?: string[];
  text?: string;
  notes?: string;
  ocrText?: string;
  category?: string;
  subcategory?: string;
  url?: string;
  source?: string;
  entities?: Array<{ value: string; type?: string }>;
}): string {
  const parts: string[] = [];
  const push = (...values: Array<string | undefined>) => {
    for (const v of values) {
      if (v && v.trim()) parts.push(v.trim());
    }
  };
  push(input.title, input.summary, input.notes);
  push(...(input.keywords ?? []));
  push(...(input.tags ?? []));
  push(input.text, input.ocrText, input.category, input.subcategory, input.url, input.source);
  for (const e of input.entities ?? []) push(e.value);
  return [...new Set(parts)].join(" ");
}
