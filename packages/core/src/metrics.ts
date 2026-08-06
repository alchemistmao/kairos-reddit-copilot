import { adminDb } from './db';
import { errMessage, log } from './logger';
import { fetchCommentStats } from './reddit';
import type { Draft } from './types';

export interface MetricsSummary {
  checked: number;
  recorded: number;
  errors: number;
}

const SIX_HOURS = 6 * 60 * 60_000;
const SEVEN_DAYS = 7 * 24 * 60 * 60_000;

/**
 * Re-fetch de upvotes/replies dos comentários postados (spec 3.6).
 * Roda a cada ciclo e grava uma nova linha em `metrics` quando o último
 * snapshot tem mais de 6h — o que cobre naturalmente as janelas de 24h e 72h.
 */
export async function refreshMetrics(): Promise<MetricsSummary> {
  const db = adminDb();
  const summary: MetricsSummary = { checked: 0, recorded: 0, errors: 0 };

  const since = new Date(Date.now() - SEVEN_DAYS).toISOString();
  const { data, error } = await db
    .from('drafts')
    .select('id, reddit_comment_id, posted_at')
    .eq('status', 'posted')
    .not('reddit_comment_id', 'is', null)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Falha ao listar posts para métricas: ${error.message}`);

  const drafts = (data ?? []) as Array<Pick<Draft, 'id' | 'reddit_comment_id' | 'posted_at'>>;

  for (const draft of drafts) {
    if (!draft.reddit_comment_id) continue;

    const { data: last, error: lastErr } = await db
      .from('metrics')
      .select('checked_at')
      .eq('draft_id', draft.id)
      .order('checked_at', { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(lastErr.message);

    const lastAt = (last ?? [])[0]?.checked_at as string | undefined;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < SIX_HOURS) continue;

    summary.checked++;

    try {
      const stats = await fetchCommentStats(draft.reddit_comment_id);
      if (!stats) continue;

      const { error: insErr } = await db.from('metrics').insert({
        draft_id: draft.id,
        upvotes: stats.score,
        replies: stats.replies,
        clicks: 0,
      });
      if (insErr) throw new Error(insErr.message);
      summary.recorded++;
    } catch (e) {
      summary.errors++;
      log.warn('Falha ao coletar métricas', { draftId: draft.id, error: errMessage(e) });
    }
  }

  return summary;
}
