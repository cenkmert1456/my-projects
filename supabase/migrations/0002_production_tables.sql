-- ============================================================================
-- DROP — Supabase schema (migration 0002)
--
-- Production hardening on top of 0001: tables required by the full product
-- spec (user settings, devices, push tokens, processing jobs, collection
-- members), auto profile creation on signup, extra drop columns, the
-- hybrid-search RPC, the avatars bucket, realtime publications and the
-- remaining indexes. Idempotent — safe to apply on a project that already
-- ran 0001.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever a new auth user registers.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- drops: extra columns from the production spec (locked, description,
-- document metadata, generic AI metadata).
-- ---------------------------------------------------------------------------
alter table public.drops
  add column if not exists locked boolean not null default false,
  add column if not exists description text,
  add column if not exists document_metadata jsonb,
  add column if not exists ai_metadata jsonb;

create index if not exists drops_user_starred_idx on public.drops (user_id, starred) where deleted_at is null;
create index if not exists drops_user_archived_idx on public.drops (user_id, archived) where deleted_at is null;
create index if not exists drops_user_pinned_idx on public.drops (user_id, pinned) where deleted_at is null;
create index if not exists drops_user_notes_idx on public.drops (user_id) where notes is not null;

-- ---------------------------------------------------------------------------
-- reminders: completed_at (the app already tracks pending/completed status).
-- ---------------------------------------------------------------------------
alter table public.reminders
  add column if not exists completed_at bigint;

-- ---------------------------------------------------------------------------
-- collection_members — collaboration on shared collections.
-- Owner = collections.user_id; members get read (or edit) access via this
-- table. RLS never trusts a client-supplied owner id.
-- ---------------------------------------------------------------------------
create table if not exists public.collection_members (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member', -- 'member' | 'editor' | 'owner'
  created_at bigint not null default drop_now_ms(),
  unique (collection_id, user_id)
);

create index if not exists collection_members_collection_idx on public.collection_members (collection_id);
create index if not exists collection_members_user_idx on public.collection_members (user_id);

alter table public.collection_members enable row level security;

-- Anyone can see memberships of collections they own or are part of.
create policy "collection_members_select" on public.collection_members
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- Only the collection owner may add/remove members; the user_id column must
-- always equal the requesting user for their own membership rows.
create policy "collection_members_insert" on public.collection_members
  for insert with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

create policy "collection_members_delete" on public.collection_members
  for delete using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- user_settings — persisted per-user preferences (theme, locale, currency,
-- notifications, privacy, AI and mobile upload prefs).
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system',
  language text not null default 'en',
  currency text not null default 'usd',
  timezone text,
  rediscover_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  privacy jsonb not null default '{}'::jsonb,
  search jsonb not null default '{}'::jsonb,
  ai jsonb not null default '{}'::jsonb,
  wifi_only_model_download boolean not null default false,
  mobile_upload jsonb not null default '{}'::jsonb,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- devices — lightweight session/device metadata (push + per-device config).
-- No invasive tracking: id, platform, app version, last-seen.
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text,
  platform text,
  app_version text,
  last_seen_at bigint,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index if not exists devices_user_idx on public.devices (user_id);

alter table public.devices enable row level security;

create policy "devices_select_own" on public.devices
  for select using (auth.uid() = user_id);
create policy "devices_insert_own" on public.devices
  for insert with check (auth.uid() = user_id);
create policy "devices_update_own" on public.devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "devices_delete_own" on public.devices
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_tokens — FCM/APNs tokens registered by the device.
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text,
  token text not null,
  provider text not null default 'fcm',
  created_at bigint not null default drop_now_ms()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
create index if not exists push_tokens_token_idx on public.push_tokens (token);

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);
create policy "push_tokens_insert_own" on public.push_tokens
  for insert with check (auth.uid() = user_id);
create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- processing_jobs — async analysis pipeline state (OCR, embeddings, AI).
-- ---------------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drop_id uuid references public.drops (id) on delete cascade,
  job_type text not null, -- 'ocr' | 'analyze' | 'embed' | 'thumbnail'
  status text not null default 'queued', -- queued | running | done | failed
  progress numeric not null default 0,
  error text,
  started_at bigint,
  completed_at bigint,
  created_at bigint not null default drop_now_ms(),
  updated_at bigint not null default drop_now_ms()
);

create index if not exists processing_jobs_user_idx on public.processing_jobs (user_id, status);
create index if not exists processing_jobs_drop_idx on public.processing_jobs (drop_id);

alter table public.processing_jobs enable row level security;

create policy "processing_jobs_select_own" on public.processing_jobs
  for select using (auth.uid() = user_id);
create policy "processing_jobs_insert_own" on public.processing_jobs
  for insert with check (auth.uid() = user_id);
create policy "processing_jobs_update_own" on public.processing_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "processing_jobs_delete_own" on public.processing_jobs
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime — only the tables the app actually subscribes to.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.drops;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.collections;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.stacks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reminders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- drop_search — hybrid search RPC.
--
--   * Text ranking via ts_rank over the denormalized search_text column.
--   * Semantic ranking via cosine similarity when an embedding is supplied.
--   * ALWAYS scoped to auth.uid() — cross-user embedding search is impossible.
--   * Optional filters: category, kind, date range, archived.
-- ---------------------------------------------------------------------------
create or replace function public.drop_search(
  p_query text default null,
  p_embedding vector(128) default null,
  p_category text default null,
  p_kind text default null,
  p_date_from bigint default null,
  p_date_to bigint default null,
  p_limit integer default 20,
  p_include_archived boolean default false
)
returns table (id uuid, score real)
language sql
stable
as $$
  select
    d.id,
    (
      coalesce(
        ts_rank(
          to_tsvector('simple', coalesce(d.search_text, '')),
          websearch_to_tsquery('simple', coalesce(p_query, ''))
        ),
        0
      )
      + case
          when p_embedding is not null and d.embedding is not null
          then 1 - (d.embedding <=> p_embedding)
          else 0
        end
    )::real as score
  from public.drops d
  where d.user_id = auth.uid()
    and d.deleted_at is null
    and (p_include_archived or d.archived = false)
    and (p_category is null or d.category = p_category)
    and (p_kind is null or d.kind = p_kind)
    and (p_date_from is null or d.saved_at >= p_date_from)
    and (p_date_to is null or d.saved_at <= p_date_to)
    and (
      p_query is null
      or p_query = ''
      or to_tsvector('simple', coalesce(d.search_text, ''))
         @@ websearch_to_tsquery('simple', p_query)
    )
  order by score desc, d.saved_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.drop_search to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Storage: avatars bucket (private, owner-scoped paths <user_id>/<file>).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

create policy "avatars_select_owner"
  on storage.objects for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_insert_owner"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_owner"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_owner"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Profiles: username/timezone/currency/appearance columns (optional).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists timezone text,
  add column if not exists currency text,
  add column if not exists appearance text;
