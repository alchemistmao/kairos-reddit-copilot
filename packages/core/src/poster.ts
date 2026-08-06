import { adminDb } from './db';
import { errMessage, log } from './logger';
import { fetchAccountKarma, postComment } from './reddit';
import { getSettings } from './settings';
import type { Draft, Settings, Subreddit, Thread } from './types';

export interface DraftContext {
  draft: Draft;
  thread: Thread;
  subreddit: Subreddit;
}

export interface GuardrailVerdict {
  ok: boolean;
  code?:
    | 'paused'
    | 'warming_mode'
    | 'daily_limit'
    | 'cooldown'
    | 'mention_quota'
    | 'duplicate_thread'
    | 'link_not_allowed'
    | 'min_karma'
    | 'bad_status';
  reason?: string;
  /** true = tentar de novo mais tarde; false = falha definitiva. */
  retryable?: boolean;
  retryAfter?: string;
}

const OK: GuardrailVerdict = { ok: true };

/** Texto que efetivamente vai ao Reddit (edição do usuário tem precedência). */
export function effectiveContent(draft: Draft): string {
  return (draft.edited_content ?? draft.content).trim();
}

let karmaCache: { value: number; at: number } | null = null;

async function accountKarma(): Promise<number | null> {
  const now = Date.now();
  if (karmaCache && now - karmaCache.at < 30 * 60_000) return karmaCache.value;
  const value = await fetchAccountKarma();
  if (value === null) return null;
  karmaCache = { value, at: now };
  return value;
}

/**
 * Guard-rails hard-coded (spec 3.5):
 *   máx 3 posts/dia, mín 2h entre posts, máx 1 menção ao Kairós por subreddit
 *   por semana, nunca postar 2x na mesma thread. Modo warming bloqueia
 *   qualquer soft_mention.
 */
export async function checkGuardrails(
  ctx: DraftContext,
  settings?: Settings,
): Promise<GuardrailVerdict> {
  const db = adminDb();
  const cfg = settings ?? (await getSettings());
  const { draft, thread, subreddit } = ctx;

  if (cfg.paused) {
    return { ok: false, code: 'paused', reason: 'Postagem pausada nas configurações', retryable: true };
  }

  if (cfg.warming_mode && draft.variant === 'soft_mention') {
    return {
      ok: false,
      code: 'warming_mode',
      reason: 'Modo warming ativo: só rascunhos help_only podem ser postados',
      retryable: false,
    };
  }

  const content = effectiveContent(draft);
  if (!subreddit.allows_links && /https?:\/\/\S+/i.test(content)) {
    return {
      ok: false,
      code: 'link_not_allowed',
      reason: `r/${subreddit.name} não permite links`,
      retryable: false,
    };
  }

  // Nunca postar 2x na mesma thread.
  const { count: alreadyPosted, error: dupErr } = await db
    .from('drafts')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', thread.id)
    .eq('status', 'posted');
  if (dupErr) throw new Error(dupErr.message);
  if ((alreadyPosted ?? 0) > 0) {
    return {
      ok: false,
      code: 'duplicate_thread',
      reason: 'Já existe um comentário postado nesta thread',
      retryable: false,
    };
  }

  // Máx N posts por dia (janela UTC).
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayCount, error: dayErr } = await db
    .from('drafts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
    .gte('posted_at', startOfDay.toISOString());
  if (dayErr) throw new Error(dayErr.message);
  if ((todayCount ?? 0) >= cfg.daily_post_limit) {
    return {
      ok: false,
      code: 'daily_limit',
      reason: `Limite diário atingido (${todayCount}/${cfg.daily_post_limit})`,
      retryable: true,
      retryAfter: nextUtcMidnight(),
    };
  }

  // Mínimo de N minutos entre posts.
  const { data: lastRows, error: lastErr } = await db
    .from('drafts')
    .select('posted_at')
    .eq('status', 'posted')
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(1);
  if (lastErr) throw new Error(lastErr.message);

  const lastPostedAt = (lastRows ?? [])[0]?.posted_at as string | undefined;
  if (lastPostedAt) {
    const readyAt = new Date(
      new Date(lastPostedAt).getTime() + cfg.min_minutes_between_posts * 60_000,
    );
    if (readyAt.getTime() > Date.now()) {
      return {
        ok: false,
        code: 'cooldown',
        reason: `Aguardando intervalo mínimo de ${cfg.min_minutes_between_posts}min entre posts`,
        retryable: true,
        retryAfter: readyAt.toISOString(),
      };
    }
  }

  // Máx N menções ao Kairós por subreddit por semana.
  if (draft.variant === 'soft_mention') {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const { count: mentions, error: mentionErr } = await db
      .from('drafts')
      .select('id, threads!inner(subreddit_id)', { count: 'exact', head: true })
      .eq('status', 'posted')
      .eq('variant', 'soft_mention')
      .gte('posted_at', weekAgo)
      .eq('threads.subreddit_id', subreddit.id);
    if (mentionErr) throw new Error(mentionErr.message);
    if ((mentions ?? 0) >= cfg.max_mentions_per_subreddit_per_week) {
      return {
        ok: false,
        code: 'mention_quota',
        reason: `Cota semanal de menções em r/${subreddit.name} já usada`,
        retryable: true,
      };
    }
  }

  // Karma mínimo exigido pelo subreddit.
  if (subreddit.min_karma > 0) {
    const karma = await accountKarma();
    if (karma !== null && karma < subreddit.min_karma) {
      return {
        ok: false,
        code: 'min_karma',
        reason: `Karma insuficiente para r/${subreddit.name} (${karma}/${subreddit.min_karma})`,
        retryable: true,
      };
    }
  }

  return OK;
}

function nextUtcMidnight(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Delay humano aleatório de 1–15 min após a aprovação (spec 3.5). */
export function randomDelayMs(settings: Settings): number {
  const min = Math.max(0, settings.min_delay_minutes);
  const max = Math.max(min, settings.max_delay_minutes);
  const minutes = min + Math.random() * (max - min);
  return Math.round(minutes * 60_000);
}

export async function loadDraftContext(draftId: string): Promise<DraftContext> {
  const db = adminDb();
  const { data, error } = await db
    .from('drafts')
    .select('*, thread:threads(*, subreddit:subreddits(*))')
    .eq('id', draftId)
    .single();
  if (error) throw new Error(`Rascunho não encontrado: ${error.message}`);

  const row = data as Draft & { thread: Thread & { subreddit: Subreddit } };
  const { thread, ...draft } = row;
  const { subreddit, ...threadOnly } = thread;

  return { draft: draft as Draft, thread: threadOnly as Thread, subreddit };
}

export interface ApproveResult {
  ok: boolean;
  scheduledAt?: string;
  verdict?: GuardrailVerdict;
}

/**
 * Aprovar = agendar. O post em si sai depois do delay aleatório, pelo
 * despachante (`publishDueDrafts`), que reavalia os guard-rails no momento
 * exato do envio.
 */
export async function approveDraft(
  draftId: string,
  editedContent?: string,
): Promise<ApproveResult> {
  const db = adminDb();
  const settings = await getSettings();
  const ctx = await loadDraftContext(draftId);

  if (!['pending', 'saved'].includes(ctx.draft.status)) {
    return {
      ok: false,
      verdict: {
        ok: false,
        code: 'bad_status',
        reason: `Rascunho em status "${ctx.draft.status}" não pode ser aprovado`,
        retryable: false,
      },
    };
  }

  if (editedContent !== undefined) {
    ctx.draft = { ...ctx.draft, edited_content: editedContent };
  }

  // Só bloqueia aqui o que não vai melhorar com o tempo; o resto é reavaliado
  // no despacho.
  const verdict = await checkGuardrails(ctx, settings);
  if (!verdict.ok && verdict.retryable === false) {
    return { ok: false, verdict };
  }

  const scheduledAt = new Date(Date.now() + randomDelayMs(settings)).toISOString();

  const { error } = await db
    .from('drafts')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt,
      edited_content: editedContent ?? ctx.draft.edited_content,
      error: null,
    })
    .eq('id', draftId);
  if (error) throw new Error(`Falha ao agendar: ${error.message}`);

  // A outra variante da mesma thread sai da fila.
  await db
    .from('drafts')
    .update({ status: 'discarded' })
    .eq('thread_id', ctx.thread.id)
    .neq('id', draftId)
    .in('status', ['pending', 'saved']);

  log.info('Rascunho agendado', { draftId, scheduledAt, variant: ctx.draft.variant });
  return { ok: true, scheduledAt, verdict };
}

export interface PublishSummary {
  due: number;
  posted: number;
  deferred: number;
  failed: number;
}

/**
 * Despachante: pega rascunhos agendados cujo horário já chegou, reavalia os
 * guard-rails e posta via Reddit API.
 */
export async function publishDueDrafts(): Promise<PublishSummary> {
  const db = adminDb();
  const summary: PublishSummary = { due: 0, posted: 0, deferred: 0, failed: 0 };

  const { data, error } = await db
    .from('drafts')
    .select('*, thread:threads(*, subreddit:subreddits(*))')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(`Falha ao listar agendados: ${error.message}`);

  const rows = (data ?? []) as Array<Draft & { thread: Thread & { subreddit: Subreddit } }>;
  summary.due = rows.length;
  if (rows.length === 0) return summary;

  const settings = await getSettings();

  for (const row of rows) {
    const { thread, ...draft } = row;
    const { subreddit, ...threadOnly } = thread;
    const ctx: DraftContext = {
      draft: draft as Draft,
      thread: threadOnly as Thread,
      subreddit,
    };

    try {
      const verdict = await checkGuardrails(ctx, settings);

      if (!verdict.ok) {
        if (verdict.retryable === false) {
          summary.failed++;
          await db
            .from('drafts')
            .update({ status: 'failed', error: verdict.reason ?? 'guard-rail' })
            .eq('id', draft.id);
          log.warn('Rascunho reprovado nos guard-rails', {
            draftId: draft.id,
            code: verdict.code,
          });
          continue;
        }

        summary.deferred++;
        const nextTry =
          verdict.retryAfter ?? new Date(Date.now() + 15 * 60_000).toISOString();
        await db
          .from('drafts')
          .update({ scheduled_at: nextTry, error: verdict.reason ?? null })
          .eq('id', draft.id);
        log.info('Post adiado por guard-rail', {
          draftId: draft.id,
          code: verdict.code,
          nextTry,
        });
        continue;
      }

      const comment = await postComment(ctx.thread.reddit_post_id, effectiveContent(ctx.draft));

      await db
        .from('drafts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          reddit_comment_id: comment.id,
          reddit_permalink: comment.permalink,
          error: null,
        })
        .eq('id', draft.id);

      summary.posted++;
      log.info('Comentário publicado', {
        draftId: draft.id,
        subreddit: subreddit.name,
        commentId: comment.id,
      });

      // Um post por ciclo mantém o espaçamento humano entre envios.
      break;
    } catch (e) {
      summary.failed++;
      await db
        .from('drafts')
        .update({ status: 'failed', error: errMessage(e).slice(0, 500) })
        .eq('id', draft.id);
      log.error('Falha ao publicar', { draftId: draft.id, error: errMessage(e) });
    }
  }

  return summary;
}
