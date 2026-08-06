-- Move configuração e credenciais do .env para dentro do app.
-- Só as 3 chaves do Supabase continuam em env (bootstrap da conexão).

-- ---------------------------------------------------------------------------
-- Segredos: legíveis APENAS por service_role (rotas de servidor e worker).
-- Sem policy para authenticated => o browser nunca lê o valor, nem logado.
-- ---------------------------------------------------------------------------

create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
-- Nenhuma policy criada de propósito: com RLS ativa e zero policies,
-- todo acesso via anon/authenticated é negado. service_role ignora RLS.

create trigger app_secrets_touch before update on public.app_secrets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Configuração não-secreta: editável na tela, lida pelo worker a cada ciclo.
-- ---------------------------------------------------------------------------

alter table public.settings
  add column if not exists kairos_url text not null default 'https://kairos.com',
  add column if not exists classifier_model text not null default 'claude-haiku-4-5',
  add column if not exists drafter_model text not null default 'claude-sonnet-4-6',
  add column if not exists poll_interval_minutes integer not null default 10,
  add column if not exists reddit_read_mode text not null default 'oauth'
    check (reddit_read_mode in ('oauth', 'public_json')),
  add column if not exists posting_mode text not null default 'api'
    check (posting_mode in ('api', 'manual'));

comment on column public.settings.reddit_read_mode is
  'oauth = API autenticada (precisa de aprovação do Reddit). public_json = endpoints .json públicos, sem credencial.';
comment on column public.settings.posting_mode is
  'api = worker posta via /api/comment. manual = fila mostra botão copiar e você posta à mão.';
