-- ============================================================================
-- DROP — Supabase schema (migration 0001)
--
-- Everything the app persists: profiles, drops, collections, stacks,
-- reminders, search history, subscriptions, shared collections,
-- notifications, activities and the plan catalog.
--
-- Conventions:
--   * UUID primary keys, auth.users as the owner identity.
--   * Milliseconds-since-epoch (bigint) for all timestamps to preserve the
--     app's existing number-based time contract (timeAgo(), filters, etc.).
--   * JSONB for AI structured metadata (entities, product, place, event, …).
--   * pgvector for the 128-dim on-device embeddings (DROP Native AI).
--   * Row Level Security is ON everywhere; default is private.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ms-epoch helper used by default values
create or replace function drop_now_ms() returns bigint
language sql stable as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  image text,
  email text,
  role text not null default 'user',
  onboarding_done boolean not null default false,
  plan text not null default 'free',
  plan_status text,
  plan_renews_at bigint,
  search_history_enabled boolean not null default true,
  daily_recall_enabled boolean not null default true,
  locale text,
  theme text,
  onboarded_at bigint,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Keep updated_at fresh on profile writes.
create or replace function public.touch_profiles() returns trigger
language plpgsql as $$
begin
  new.updated_at := drop_now_ms();
  return new;
end; $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profiles();

-- ---------------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------------
create table public.drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- user-visible state
  kind text not null,
  title text not null,
  summary text,
  category text not null default 'Other',
  subcategory text,
  keywords jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  starred boolean not null default false,
  archived boolean not null default false,
  pinned boolean not null default false,
  sensitive boolean not null default false,
  notes text,
  deleted_at bigint,
  saved_at bigint not null default drop_now_ms(),

  -- processing state
  status text not null default 'processing',
  analysis_status text not null default 'pending',
  analysis_version integer,
  confidence numeric,

  -- content
  url text,
  text text,
  ocr_text text,
  ocr_language text,
  ocr_engine text,
  search_text text,
  source text,
  source_url text,

  -- files (Supabase storage paths inside the private `drop-files` bucket)
  storage_path text,
  thumbnail_path text,
  content_type text,
  file_name text,

  -- AI analysis output
  language text,
  sentiment text,
  intent text,
  entities jsonb not null default '[]'::jsonb,
  product jsonb,
  place jsonb,
  event jsonb,
  receipt jsonb,
  reservation jsonb,
  flight jsonb,
  suggested_action text,
  suggested_reminder jsonb,

  -- semantic search (DROP Native AI 128-dim on-device embeddings)
  embedding vector(128),
  embedding_provider text,

  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

-- Hybrid search index (full text over the denormalized search_text).
create index drops_user_saved_at_idx on public.drops (user_id, saved_at desc);
create index drops_user_category_idx on public.drops (user_id, category);
create index drops_user_status_idx on public.drops (user_id, status);
create index drops_user_deleted_at_idx on public.drops (user_id, deleted_at);
create index drops_user_url_idx on public.drops (user_id, url);
create index drops_user_kind_idx on public.drops (user_id, kind);
create index drops_search_vector_idx on public.drops
  using gin (to_tsvector('simple', coalesce(search_text, '')));
-- Semantic similarity (optional; used when embeddings exist).
create index drops_embedding_idx on public.drops
  using hnsw (embedding vector_cosine_ops);

alter table public.drops enable row level security;

create policy "drops_select_own" on public.drops
  for select using (auth.uid() = user_id);
create policy "drops_insert_own" on public.drops
  for insert with check (auth.uid() = user_id);
create policy "drops_update_own" on public.drops
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "drops_delete_own" on public.drops
  for delete using (auth.uid() = user_id);

create or replace function public.touch_drops() returns trigger
language plpgsql as $$
begin
  new.updated_at := drop_now_ms();
  return new;
end; $$;

create trigger drops_touch before update on public.drops
  for each row execute function public.touch_drops();

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  description text,
  is_public boolean not null default false,
  share_token text,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index collections_user_idx on public.collections (user_id);

alter table public.collections enable row level security;

create policy "collections_select_own" on public.collections
  for select using (auth.uid() = user_id);
-- Public collections are readable by anyone (share link). Sensitive fields
-- are still owner-only; the API strips private metadata before exposing.
create policy "collections_select_public" on public.collections
  for select using (is_public = true);
create policy "collections_insert_own" on public.collections
  for insert with check (auth.uid() = user_id);
create policy "collections_update_own" on public.collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collections_delete_own" on public.collections
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- collection_drops
-- ---------------------------------------------------------------------------
create table public.collection_drops (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at bigint not null default drop_now_ms(),
  unique (collection_id, drop_id)
);

create index collection_drops_collection_idx on public.collection_drops (collection_id);
create index collection_drops_drop_idx on public.collection_drops (drop_id);
create index collection_drops_user_idx on public.collection_drops (user_id);

alter table public.collection_drops enable row level security;

create policy "collection_drops_select_own" on public.collection_drops
  for select using (auth.uid() = user_id);
create policy "collection_drops_insert_own" on public.collection_drops
  for insert with check (auth.uid() = user_id);
create policy "collection_drops_delete_own" on public.collection_drops
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- stacks
-- ---------------------------------------------------------------------------
create table public.stacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  description text,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index stacks_user_idx on public.stacks (user_id);

alter table public.stacks enable row level security;

create policy "stacks_select_own" on public.stacks
  for select using (auth.uid() = user_id);
create policy "stacks_insert_own" on public.stacks
  for insert with check (auth.uid() = user_id);
create policy "stacks_update_own" on public.stacks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stacks_delete_own" on public.stacks
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- stack_drops
-- ---------------------------------------------------------------------------
create table public.stack_drops (
  id uuid primary key default gen_random_uuid(),
  stack_id uuid not null references public.stacks (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at bigint not null default drop_now_ms(),
  unique (stack_id, drop_id)
);

create index stack_drops_stack_idx on public.stack_drops (stack_id);
create index stack_drops_drop_idx on public.stack_drops (drop_id);
create index stack_drops_user_idx on public.stack_drops (user_id);

alter table public.stack_drops enable row level security;

create policy "stack_drops_select_own" on public.stack_drops
  for select using (auth.uid() = user_id);
create policy "stack_drops_insert_own" on public.stack_drops
  for insert with check (auth.uid() = user_id);
create policy "stack_drops_delete_own" on public.stack_drops
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drop_id uuid not null references public.drops (id) on delete cascade,
  text text not null,
  remind_at bigint not null,
  status text not null default 'pending',
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index reminders_user_remind_at_idx on public.reminders (user_id, remind_at);
create index reminders_drop_idx on public.reminders (drop_id);

alter table public.reminders enable row level security;

create policy "reminders_select_own" on public.reminders
  for select using (auth.uid() = user_id);
create policy "reminders_insert_own" on public.reminders
  for insert with check (auth.uid() = user_id);
create policy "reminders_update_own" on public.reminders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminders_delete_own" on public.reminders
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- search_history
-- ---------------------------------------------------------------------------
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  result_count integer,
  created_at bigint not null default drop_now_ms()
);

create index search_history_user_idx on public.search_history (user_id, created_at desc);

alter table public.search_history enable row level security;

create policy "search_history_select_own" on public.search_history
  for select using (auth.uid() = user_id);
create policy "search_history_insert_own" on public.search_history
  for insert with check (auth.uid() = user_id);
create policy "search_history_delete_own" on public.search_history
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subscriptions (metadata for future billing; no payment provider logic here)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  status text not null default 'trialing',
  plan text not null default 'free',
  current_period_end bigint,
  cancel_at_period_end boolean not null default false,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms(),
  unique (user_id)
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "subscriptions_insert_own" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "subscriptions_update_own" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscriptions_delete_own" on public.subscriptions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- shared_collections
-- ---------------------------------------------------------------------------
create table public.shared_collections (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade, -- owner
  shared_with uuid references auth.users (id) on delete cascade,      -- recipient (null = link share)
  can_edit boolean not null default false,
  token text unique,
  created_at bigint not null default drop_now_ms()
);

create index shared_collections_owner_idx on public.shared_collections (user_id);
create index shared_collections_recipient_idx on public.shared_collections (shared_with);

alter table public.shared_collections enable row level security;

-- Owner manages shares; recipient can read shares addressed to them.
create policy "shared_collections_select_owner" on public.shared_collections
  for select using (auth.uid() = user_id);
create policy "shared_collections_select_recipient" on public.shared_collections
  for select using (auth.uid() = shared_with);
create policy "shared_collections_insert_owner" on public.shared_collections
  for insert with check (auth.uid() = user_id);
create policy "shared_collections_delete_owner" on public.shared_collections
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drop_id uuid references public.drops (id) on delete set null,
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at bigint not null default drop_now_ms()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
create policy "notifications_insert_own" on public.notifications
  for insert with check (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- activities (lightweight history: saved, edited, starred, archived, …)
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drop_id uuid references public.drops (id) on delete cascade,
  action text not null,
  detail text,
  at bigint not null default drop_now_ms()
);

create index activities_user_at_idx on public.activities (user_id, at desc);
create index activities_drop_idx on public.activities (drop_id);

alter table public.activities enable row level security;

create policy "activities_select_own" on public.activities
  for select using (auth.uid() = user_id);
create policy "activities_insert_own" on public.activities
  for insert with check (auth.uid() = user_id);
create policy "activities_delete_own" on public.activities
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- plans (catalog; seeded with the same definitions the app used before)
-- ---------------------------------------------------------------------------
create table public.plans (
  plan_id text primary key,
  name text not null,
  price_monthly numeric not null default 0,
  price_yearly numeric not null default 0,
  currency text not null default 'usd',
  drop_limit integer,
  features jsonb not null default '[]'::jsonb
);

alter table public.plans enable row level security;

create policy "plans_select_all" on public.plans
  for select using (true);

insert into public.plans (plan_id, name, price_monthly, price_yearly, currency, drop_limit, features) values
  ('free', 'Free', 0, 0, 'usd', 100, '["100 Drops","Basic search","Basic AI organization","1 collection"]'::jsonb),
  ('pro', 'Pro', 5.99, 49.99, 'usd', null, '["Unlimited Drops","Advanced AI search","Ask DROP assistant","Document understanding","Smart reminders","Unlimited collections","Travel organization","Wishlist"]'::jsonb),
  ('family', 'Family', 9.99, 99.99, 'usd', null, '["Up to 5 people","Individual private accounts","Optional shared collections","Shared travel lists","Shared shopping lists"]'::jsonb)
on conflict (plan_id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage: private `drop-files` bucket (ownership-based policies)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('drop-files', 'drop-files', false)
on conflict (id) do nothing;

-- Files are stored as <user_id>/<drop_id>/<filename> so ownership is derived
-- from the first path segment.
create policy "drop_files_select_owner"
  on storage.objects for select
  using (bucket_id = 'drop-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drop_files_insert_owner"
  on storage.objects for insert
  with check (bucket_id = 'drop-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drop_files_update_owner"
  on storage.objects for update
  using (bucket_id = 'drop-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'drop-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drop_files_delete_owner"
  on storage.objects for delete
  using (bucket_id = 'drop-files' and (storage.foldername(name))[1] = auth.uid()::text);
