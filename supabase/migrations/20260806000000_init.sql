-- Kairós Reddit Copilot — schema inicial
-- Data model conforme seção 4 da spec, com RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Autorização: quem pode usar o painel
-- ---------------------------------------------------------------------------

create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Usada por todas as políticas de RLS. security definer para poder ler
-- allowed_emails mesmo com RLS ativo nela.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_emails ae
    where lower(ae.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- subreddits
-- ---------------------------------------------------------------------------

create table if not exists public.subreddits (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                    -- sem o prefixo "r/"
  rules_summary text not null default '',
  allows_links boolean not null default true,
  min_karma integer not null default 0,
  track text not null default 'acquisition'
    check (track in ('acquisition', 'launch')),  -- Trilha A / Trilha B da spec
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subreddits_touch before update on public.subreddits
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- keywords
-- ---------------------------------------------------------------------------

create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  intent_level text not null default 'medium'
    check (intent_level in ('high', 'medium', 'competitor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists keywords_active_idx on public.keywords (active);

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  reddit_post_id text not null unique,          -- id base36 do post (sem "t3_")
  subreddit_id uuid not null references public.subreddits (id) on delete cascade,
  title text not null,
  body text not null default '',
  author text not null default '',
  url text not null default '',
  permalink text not null default '',
  created_utc timestamptz,
  score integer not null default 0,
  num_comments integer not null default 0,
  matched_keywords text[] not null default '{}',
  classification text not null default 'PENDING'
    check (classification in ('PENDING', 'HIGH_INTENT', 'HELP_ONLY', 'SKIP')),
  classification_reason text not null default '',
  suggested_angle text not null default '',
  status text not null default 'new'
    check (status in ('new', 'classified', 'drafted', 'skipped', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists threads_status_idx on public.threads (status);
create index if not exists threads_classification_idx on public.threads (classification);
create index if not exists threads_created_utc_idx on public.threads (created_utc desc);

create trigger threads_touch before update on public.threads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- drafts
-- ---------------------------------------------------------------------------

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  variant text not null check (variant in ('help_only', 'soft_mention')),
  content text not null,
  edited_content text,
  status text not null default 'pending'
    check (status in ('pending', 'saved', 'approved', 'scheduled', 'posted', 'discarded', 'failed')),
  risk_flags text[] not null default '{}',
  scheduled_at timestamptz,
  posted_at timestamptz,
  reddit_comment_id text,                        -- id base36 do comentário (sem "t1_")
  reddit_permalink text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, variant)
);

create index if not exists drafts_status_idx on public.drafts (status);
create index if not exists drafts_scheduled_idx on public.drafts (status, scheduled_at);
create index if not exists drafts_posted_idx on public.drafts (posted_at desc);

-- Guard-rail no nível do banco: nunca postar duas vezes na mesma thread.
create unique index if not exists drafts_one_post_per_thread_idx
  on public.drafts (thread_id)
  where status in ('scheduled', 'posted');

create trigger drafts_touch before update on public.drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- metrics
-- ---------------------------------------------------------------------------

create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  upvotes integer not null default 0,
  replies integer not null default 0,
  clicks integer not null default 0,
  checked_at timestamptz not null default now()
);

create index if not exists metrics_draft_idx on public.metrics (draft_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- settings (linha única)
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  id boolean primary key default true check (id),
  daily_post_limit integer not null default 3,
  min_minutes_between_posts integer not null default 120,
  min_delay_minutes integer not null default 1,
  max_delay_minutes integer not null default 15,
  max_mentions_per_subreddit_per_week integer not null default 1,
  warming_mode boolean not null default true,
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

insert into public.settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- O worker usa a service_role key, que ignora RLS por design.
-- O painel usa a sessão do Supabase Auth e só passa por public.is_owner().

alter table public.allowed_emails enable row level security;
alter table public.subreddits     enable row level security;
alter table public.keywords       enable row level security;
alter table public.threads        enable row level security;
alter table public.drafts         enable row level security;
alter table public.metrics        enable row level security;
alter table public.settings       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'subreddits', 'keywords', 'threads', 'drafts', 'metrics', 'settings'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
      t || '_owner_all', t
    );
  end loop;
end;
$$;

-- allowed_emails é somente leitura pelo dono; gestão só via service_role/SQL.
create policy allowed_emails_owner_select on public.allowed_emails
  for select to authenticated using (public.is_owner());
