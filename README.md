# Kairós Reddit Copilot

Listening engine, AI draft generation and a human approval queue for Reddit. It automates
about 90% of the work and keeps the human decision in the last step: nothing is ever posted
without explicit, per-comment approval.

Guard-rails are re-evaluated at send time, not at approval time: at most 3 posts a day, at
least 2 hours between posts, one product mention per subreddit per week, never twice in the
same thread (enforced by a partial unique index in the database), and a random 1–15 minute
delay after approval. Warming mode is on by default, so only `help_only` drafts can go out.

Stack: TypeScript, Next.js 14 (App Router, PWA), Supabase with row-level security, a Railway
worker on a 10-minute cron, Reddit API via OAuth, and Claude (Haiku for classification,
Sonnet for drafting, two variants per thread). Prompts live in `prompts/*.md` and are loaded
at runtime, so they can be changed without a deploy.

The full documentation below is in Portuguese.

---

## Documentação

Motor de escuta + geração de rascunhos + fila de aprovação para engajamento no
Reddit. Automatiza ~90% do trabalho e deixa a decisão humana no último passo —
o que evita ban e mantém autenticidade.

```
Railway worker ──cron 10min──> Reddit API (OAuth script app)
      │
      │ threads novas → filtro local de keywords
      ▼
Claude API (haiku-4-5 classifier → sonnet-4-6 drafter, 2 variantes)
      │
      ▼
   Supabase ──> Next.js (Vercel, PWA mobile-first) ──> aprovar/editar/descartar
      ▲                                                        │
      └──────── post via Reddit API (guard-rails) <────────────┘
```

## Layout

| Caminho | O que é |
| --- | --- |
| `packages/core` | Lógica compartilhada: Reddit, Claude, Supabase, classifier, drafter, guard-rails, métricas |
| `worker` | Processo Railway: cron de polling (10min) + despachante de posts agendados |
| `web` | Next.js 14 App Router, mobile-first, PWA — fila de aprovação |
| `prompts/*.md` | Prompts do classifier e do drafter, **carregados em runtime** |
| `supabase/migrations` | Schema SQL com RLS |

## Regras de negócio implementadas

**Guard-rails (`packages/core/src/poster.ts`)** — reavaliados no momento exato do
envio, não só na aprovação:

- máx **3 posts/dia** (janela UTC, `settings.daily_post_limit`)
- mín **2h entre posts** (`settings.min_minutes_between_posts`)
- máx **1 menção ao Kairós por subreddit por semana**
- **nunca 2x na mesma thread** — reforçado por índice único parcial no banco
- **delay aleatório de 1–15 min** após a aprovação (padrão humano)
- **modo warming ligado por padrão**: só variantes `help_only` podem ser postadas
- link bloqueado em subreddit com `allows_links = false`
- karma mínimo por subreddit

Bloqueio *retryable* (limite diário, cooldown, cota) reagenda o rascunho.
Bloqueio definitivo (warming, link proibido, thread duplicada) marca `failed`.

**Badge de risco** — `drafts.risk_flags` sinaliza no card quando a menção
violaria a regra do subreddit, quando o modo warming está ativo, ou quando o
texto ficou longo demais.

**Custo** — o filtro local de keywords roda antes de qualquer chamada à Claude
API; o haiku classifica e derruba a maior parte antes do sonnet.

## Deploy

Não há passo manual: cada peça é configurada por arquivo versionado.

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Vercel (`/web`) | `vercel.json` | `npm run build:web`, output `web/.next` |
| Railway (`/worker`) | `railway.json` | `npm ci && npm run build:worker`, start `npm run start:worker` |
| Supabase | `.github/workflows/db-migrate.yml` | `supabase db push` a cada push na `main` que toque `supabase/` |
| Seed | `packages/core/src/seed-data.ts` | Upsert idempotente de subreddits, keywords, `settings` e `OWNER_EMAIL` no boot do worker |

O que **você** precisa fazer uma vez, fora do repo (são credenciais — não dá
para versionar):

1. Criar o script app em <https://www.reddit.com/prefs/apps> (tipo `script`).
2. Criar o projeto Supabase e apontar Vercel/Railway/GitHub para ele.
3. Preencher as variáveis de `.env.example` em: Vercel (projeto web), Railway
   (serviço worker) e GitHub Secrets (`SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`).

### Variáveis por ambiente

- **Railway (worker)**: `REDDIT_*`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `KAIROS_URL`,
  `POLL_INTERVAL_MINUTES=10`
- **Vercel (web)**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `REDDIT_*`, `OWNER_EMAIL`, `KAIROS_URL`,
  `CRON_SECRET`

O worker já publica os posts agendados sozinho (tick de 60s). A rota
`GET /api/cron/publish` existe como alternativa caso você prefira Vercel Cron —
protegida por `CRON_SECRET`, e nesse caso adicione o bloco `crons` ao
`vercel.json` (exige plano Pro para cadência abaixo de 1x/dia).

## Rodando local

```bash
npm install
cp .env.example .env   # preencha
npm run build
npm run seed           # opcional: aplica o seed sem subir o worker
npm run start:worker   # polling + despacho
npm run dev:web        # painel em http://localhost:3000
```

Para o banco local: `supabase start && supabase db reset && npm run seed`.

## Acesso ao painel

Login por magic link do Supabase Auth. Só o e-mail em `OWNER_EMAIL` entra — a
checagem acontece em três camadas: `middleware.ts`, `requireSession()` e as
policies de RLS via `public.is_owner()`. O worker usa a `service_role` key, que
ignora RLS por design.

## Notas

- **Segurança**: `next@14.2.35` carrega advisories abertos que só têm correção
  em Next 15/16. O App Router 14 foi um requisito explícito; se quiser fechá-los,
  a migração para 15+ é a saída.
- **Modo warming**: ligado por padrão (`settings.warming_mode = true`). Desligue
  no banco só depois de 2–3 semanas de atividade genuína e ~100+ de karma.
- **Trilha B** (r/SideProject, r/IMadeThis, r/startups, r/Entrepreneur,
  r/ClaudeAI) entra no seed com `active = false`: são posts de lançamento
  únicos, não alvo de polling contínuo. Ative no banco quando for postar.
- **Cliques nas UTMs** ficam como `metrics.clicks = 0` até você plugar a fonte
  (GA4/Plausible); upvotes e replies já são coletados a cada ciclo.
