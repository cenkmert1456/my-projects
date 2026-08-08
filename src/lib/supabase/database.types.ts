/**
 * DROP — Supabase database types.
 *
 * These mirror the PostgreSQL schema in `supabase/migrations/0001_initial_schema.sql`.
 * Row types are snake_case (what Postgres returns); the application aliases at
 * the bottom are camelCase and are what the UI consumes (preserving the exact
 * data contract the app used before).
 *
 * Regenerate from a live project with:
 *   supabase gen types typescript --project-id <ref> --schema public
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: { Row: ProfilesRow; Insert: ProfilesInsert; Update: Partial<ProfilesInsert>; Relationships: [] };
      drops: { Row: DropsRow; Insert: DropsInsert; Update: Partial<DropsInsert>; Relationships: [] };
      collections: { Row: CollectionsRow; Insert: CollectionsInsert; Update: Partial<CollectionsInsert>; Relationships: [] };
      collection_drops: {
        Row: CollectionDropsRow;
        Insert: CollectionDropsInsert;
        Update: Partial<CollectionDropsInsert>;
        Relationships: [
          {
            foreignKeyName: "collection_drops_collection_id_fkey",
            columns: ["collection_id"],
            referencedRelation: "collections",
            referencedColumns: ["id"],
          },
        ];
      };
      stacks: { Row: StacksRow; Insert: StacksInsert; Update: Partial<StacksInsert>; Relationships: [] };
      stack_drops: {
        Row: StackDropsRow;
        Insert: StackDropsInsert;
        Update: Partial<StackDropsInsert>;
        Relationships: [
          {
            foreignKeyName: "stack_drops_stack_id_fkey",
            columns: ["stack_id"],
            referencedRelation: "stacks",
            referencedColumns: ["id"],
          },
        ];
      };
      reminders: { Row: RemindersRow; Insert: RemindersInsert; Update: Partial<RemindersInsert>; Relationships: [] };
      search_history: { Row: SearchHistoryRow; Insert: SearchHistoryInsert; Update: Partial<SearchHistoryInsert>; Relationships: [] };
      subscriptions: { Row: SubscriptionsRow; Insert: SubscriptionsInsert; Update: Partial<SubscriptionsInsert>; Relationships: [] };
      shared_collections: { Row: SharedCollectionsRow; Insert: SharedCollectionsInsert; Update: Partial<SharedCollectionsInsert>; Relationships: [] };
      notifications: { Row: NotificationsRow; Insert: NotificationsInsert; Update: Partial<NotificationsInsert>; Relationships: [] };
      activities: { Row: ActivitiesRow; Insert: ActivitiesInsert; Update: Partial<ActivitiesInsert>; Relationships: [] };
      plans: { Row: PlansRow; Insert: PlansInsert; Update: Partial<PlansInsert>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ---------------------------------------------------------------------------
// Row types (snake_case, straight from Postgres)
// ---------------------------------------------------------------------------

export type ProfilesRow = {
  id: string;
  name: string | null;
  image: string | null;
  email: string | null;
  role: string;
  onboarding_done: boolean;
  plan: string;
  plan_status: string | null;
  plan_renews_at: number | null;
  search_history_enabled: boolean;
  daily_recall_enabled: boolean;
  locale: string | null;
  theme: string | null;
  onboarded_at: number | null;
  created_at: number;
  updated_at: number;
};
export type ProfilesInsert = Partial<ProfilesRow> & { id: string };

export type DropsRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  summary: string | null;
  category: string;
  subcategory: string | null;
  keywords: Json;
  tags: Json;
  starred: boolean;
  archived: boolean;
  pinned: boolean;
  sensitive: boolean;
  notes: string | null;
  deleted_at: number | null;
  saved_at: number;
  status: string;
  analysis_status: string;
  analysis_version: number | null;
  confidence: number | null;
  url: string | null;
  text: string | null;
  ocr_text: string | null;
  ocr_language: string | null;
  ocr_engine: string | null;
  search_text: string | null;
  source: string | null;
  source_url: string | null;
  storage_path: string | null;
  thumbnail_path: string | null;
  content_type: string | null;
  file_name: string | null;
  language: string | null;
  sentiment: string | null;
  intent: string | null;
  entities: Json;
  product: Json | null;
  place: Json | null;
  event: Json | null;
  receipt: Json | null;
  reservation: Json | null;
  flight: Json | null;
  suggested_action: string | null;
  suggested_reminder: Json | null;
  embedding: number[] | null;
  embedding_provider: string | null;
  created_at: number;
  updated_at: number;
};
export type DropsInsert = Partial<DropsRow> & { user_id: string; kind: string; title: string };

export type CollectionsRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  description: string | null;
  is_public: boolean;
  share_token: string | null;
  created_at: number;
  updated_at: number;
};
export type CollectionsInsert = Partial<CollectionsRow> & { user_id: string; name: string };

export type CollectionDropsRow = {
  id: string;
  collection_id: string;
  drop_id: string;
  user_id: string;
  created_at: number;
};
export type CollectionDropsInsert = Partial<CollectionDropsRow> & {
  collection_id: string;
  drop_id: string;
  user_id: string;
};

export type StacksRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
};
export type StacksInsert = Partial<StacksRow> & { user_id: string; name: string };

export type StackDropsRow = {
  id: string;
  stack_id: string;
  drop_id: string;
  user_id: string;
  created_at: number;
};
export type StackDropsInsert = Partial<StackDropsRow> & {
  stack_id: string;
  drop_id: string;
  user_id: string;
};

export type RemindersRow = {
  id: string;
  user_id: string;
  drop_id: string;
  text: string;
  remind_at: number;
  status: string;
  created_at: number;
  updated_at: number;
};
export type RemindersInsert = Partial<RemindersRow> & {
  user_id: string;
  drop_id: string;
  text: string;
  remind_at: number;
};

export type SearchHistoryRow = {
  id: string;
  user_id: string;
  query: string;
  result_count: number | null;
  created_at: number;
};
export type SearchHistoryInsert = Partial<SearchHistoryRow> & { user_id: string; query: string };

export type SubscriptionsRow = {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  plan: string;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  created_at: number;
  updated_at: number;
};
export type SubscriptionsInsert = Partial<SubscriptionsRow> & { user_id: string; provider: string };

export type SharedCollectionsRow = {
  id: string;
  collection_id: string;
  user_id: string;
  shared_with: string | null;
  can_edit: boolean;
  token: string | null;
  created_at: number;
};
export type SharedCollectionsInsert = Partial<SharedCollectionsRow> & {
  collection_id: string;
  user_id: string;
};

export type NotificationsRow = {
  id: string;
  user_id: string;
  drop_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: number;
};
export type NotificationsInsert = Partial<NotificationsRow> & {
  user_id: string;
  type: string;
  title: string;
};

export type ActivitiesRow = {
  id: string;
  user_id: string;
  drop_id: string | null;
  action: string;
  detail: string | null;
  at: number;
};
export type ActivitiesInsert = Partial<ActivitiesRow> & { user_id: string; action: string };

export type PlansRow = {
  plan_id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  drop_limit: number | null;
  features: Json;
};
export type PlansInsert = Partial<PlansRow> & { plan_id: string; name: string };

// ---------------------------------------------------------------------------
// Application aliases (camelCase — what the UI consumes)
// ---------------------------------------------------------------------------

export type DropKind = "image" | "screenshot" | "link" | "note" | "document";
export type DropStatus = "processing" | "ready" | "needs_review" | "failed";
export type AnalysisStatus = "pending" | "processing" | "done" | "failed";

export type DropEntity = {
  type: string;
  value: string;
  confidence: number;
  metadata?: Record<string, string>;
};

export type ProductMeta = {
  name?: string;
  brand?: string;
  price?: number;
  currency?: string;
  store?: string;
  productUrl?: string;
  category?: string;
  variant?: string;
  color?: string;
  size?: string;
};

export type PlaceMeta = {
  name?: string;
  city?: string;
  country?: string;
  address?: string;
  category?: string;
  source?: string;
  lat?: number;
  lng?: number;
};

export type EventMeta = {
  name?: string;
  startTime?: number;
  endTime?: number;
  location?: string;
  url?: string;
};

export type ReceiptMeta = {
  merchant?: string;
  purchaseDate?: number;
  items?: string[];
  total?: number;
  currency?: string;
  paymentMethod?: string;
  orderNumber?: string;
  returnDeadline?: number;
  warrantyUntil?: number;
};

export type ReservationMeta = {
  type?: string;
  reference?: string;
  provider?: string;
  startTime?: number;
  endTime?: number;
  location?: string;
  details?: string;
};

export type FlightMeta = {
  airline?: string;
  flightNumber?: string;
  departure?: string;
  destination?: string;
  departureTime?: number;
  arrivalTime?: number;
  bookingReference?: string;
};

export type SuggestedReminderMeta = {
  text: string;
  at?: number;
};

/** The Drop document as the app has always known it. */
export interface Drop {
  id: string;
  /** Alias of `id` — legacy UI used Convex `_id`. */
  _id: string;
  userId: string;
  kind: DropKind;
  title: string;
  summary?: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  tags: string[];
  starred?: boolean;
  archived?: boolean;
  pinned?: boolean;
  sensitive?: boolean;
  notes?: string;
  deletedAt?: number;
  savedAt: number;
  status: DropStatus;
  analysisStatus: AnalysisStatus;
  analysisVersion?: number;
  confidence?: number;
  url?: string;
  text?: string;
  ocrText?: string;
  ocrLanguage?: string;
  ocrEngine?: string;
  searchText?: string;
  source?: string;
  sourceUrl?: string;
  storagePath?: string;
  /** Alias of `storagePath` — legacy UI used `storageId`. */
  storageId?: string;
  thumbnailPath?: string;
  contentType?: string;
  fileName?: string;
  language?: string;
  sentiment?: string;
  intent?: string;
  entities: DropEntity[];
  product?: ProductMeta;
  place?: PlaceMeta;
  event?: EventMeta;
  receipt?: ReceiptMeta;
  reservation?: ReservationMeta;
  flight?: FlightMeta;
  suggestedAction?: string;
  suggestedReminder?: SuggestedReminderMeta;
  embedding?: number[];
  embeddingProvider?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  /** Alias of `id` — legacy UI used Convex `_id`. */
  _id: string;
  userId: string;
  name: string;
  emoji?: string;
  color?: string;
  description?: string;
  isPublic?: boolean;
  shareToken?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionWithCount extends Collection {
  dropCount: number;
}

export interface Stack {
  id: string;
  /** Alias of `id` — legacy UI used Convex `_id`. */
  _id: string;
  userId: string;
  name: string;
  emoji?: string;
  color?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StackWithDrops {
  stack: Stack;
  count: number;
  drops: Drop[];
}

export type ReminderStatus = "pending" | "completed" | "dismissed";

export interface Reminder {
  id: string;
  /** Alias of `id` — legacy UI used Convex `_id`. */
  _id: string;
  userId: string;
  dropId: string;
  /** Title of the linked Drop (joined by the service for list views). */
  dropTitle?: string;
  text: string;
  remindAt: number;
  status: ReminderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  id: string;
  name?: string;
  image?: string;
  email?: string;
  role: string;
  onboardingDone?: boolean;
  plan: string;
  planStatus?: string;
  planRenewsAt?: number;
  searchHistoryEnabled?: boolean;
  dailyRecallEnabled?: boolean;
  locale?: string;
  theme?: string;
  onboardedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SearchHistory {
  id: string;
  /** Alias of `id` — legacy UI used Convex `_id`. */
  _id: string;
  userId: string;
  query: string;
  resultCount?: number;
  createdAt: number;
}

export interface SearchHit {
  drop: Drop;
  score: number;
  matched: string[];
  semantic: boolean;
}

export interface SearchFilters {
  category?: string;
  kind?: string;
  source?: string;
  place?: string;
  minPrice?: number;
  maxPrice?: number;
  dateFrom?: number;
  dateTo?: number;
  collectionId?: string;
  tag?: string;
  starred?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

export interface AskSource {
  id: string;
  title: string;
  summary?: string;
  category?: string;
  savedAt?: number;
  facts?: string;
}

export interface AskResult {
  answer: string | null;
  sources: AskSource[];
}

export interface PlanInfo {
  plan: string;
  planName: string;
  dropLimit: number | null;
  dropCount: number;
  isUnlimited: boolean;
  planStatus?: string;
  planRenewsAt?: number;
}

export interface DropStats {
  total: number;
  places: number;
  products: number;
  favorites: number;
  trips: number;
  cities: number;
  thisMonth: number;
  upcoming: number;
  screenshots: number;
  rediscovered: number;
}

export interface DropCounts {
  total: number;
  byCategory: Record<string, number>;
  byKind: Record<string, number>;
  starred: number;
  pinned: number;
  places: number;
  products: number;
  upcoming: number;
  needsReview: number;
  processing: number;
  documents: number;
  screenshots: number;
  links: number;
  notes: number;
}
