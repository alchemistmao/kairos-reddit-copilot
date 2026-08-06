import { adminDb } from './db';
import type { Draft, DraftStatus, QueueItem, Subreddit, Thread } from './types';

type Row = Thread & {
  subreddit: Pick<Subreddit, 'id' | 'name' | 'allows_links' | 'rules_summary' | 'track'>;
  drafts: Draft[];
};

const SELECT =
  '*, subreddit:subreddits(id, name, allows_links, rules_summary, track), drafts(*)';

/** Fila de aprovação: threads com rascunhos em determinado status. */
export async function listQueue(
  statuses: DraftStatus[] = ['pending', 'saved'],
  limit = 50,
): Promise<QueueItem[]> {
  const { data, error } = await adminDb()
    .from('threads')
    .select(SELECT)
    .in('classification', ['HIGH_INTENT', 'HELP_ONLY'])
    .order('created_utc', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao carregar a fila: ${error.message}`);

  return ((data ?? []) as Row[])
    .map((row) => {
      const { subreddit, drafts, ...thread } = row;
      return {
        thread: thread as Thread,
        subreddit,
        drafts: (drafts ?? []).filter((d) => statuses.includes(d.status)),
      };
    })
    .filter((item) => item.drafts.length > 0);
}

/** Histórico: threads cujo rascunho foi agendado, postado ou falhou. */
export async function listHistory(limit = 50): Promise<QueueItem[]> {
  const { data, error } = await adminDb()
    .from('threads')
    .select(SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao carregar histórico: ${error.message}`);

  const relevant: DraftStatus[] = ['scheduled', 'posted', 'failed'];
  return ((data ?? []) as Row[])
    .map((row) => {
      const { subreddit, drafts, ...thread } = row;
      return {
        thread: thread as Thread,
        subreddit,
        drafts: (drafts ?? []).filter((d) => relevant.includes(d.status)),
      };
    })
    .filter((item) => item.drafts.length > 0);
}

export interface DashboardRow {
  subreddit: string;
  posted: number;
  upvotes: number;
  replies: number;
}

/** Dashboard: qual subreddit converte (spec 3.6). */
export async function subredditPerformance(): Promise<DashboardRow[]> {
  const db = adminDb();

  const { data, error } = await db
    .from('drafts')
    .select('id, thread:threads(subreddit:subreddits(name)), metrics(upvotes, replies, checked_at)')
    .eq('status', 'posted');
  if (error) throw new Error(`Falha ao carregar dashboard: ${error.message}`);

  const bySub = new Map<string, DashboardRow>();

  for (const raw of (data ?? []) as unknown as Array<{
    thread: { subreddit: { name: string } | null } | null;
    metrics: Array<{ upvotes: number; replies: number; checked_at: string }> | null;
  }>) {
    const name = raw.thread?.subreddit?.name ?? 'desconhecido';
    const row = bySub.get(name) ?? { subreddit: name, posted: 0, upvotes: 0, replies: 0 };
    row.posted++;

    const latest = (raw.metrics ?? []).sort((a, b) =>
      a.checked_at < b.checked_at ? 1 : -1,
    )[0];
    if (latest) {
      row.upvotes += latest.upvotes;
      row.replies += latest.replies;
    }

    bySub.set(name, row);
  }

  return [...bySub.values()].sort((a, b) => b.upvotes - a.upvotes);
}

export interface KeywordRow {
  keyword: string;
  threads: number;
  highIntent: number;
}

/** Dashboard: qual keyword converte. */
export async function keywordPerformance(): Promise<KeywordRow[]> {
  const { data, error } = await adminDb()
    .from('threads')
    .select('matched_keywords, classification');
  if (error) throw new Error(`Falha ao carregar keywords: ${error.message}`);

  const byKeyword = new Map<string, KeywordRow>();
  for (const row of (data ?? []) as Array<{
    matched_keywords: string[];
    classification: string;
  }>) {
    for (const kw of row.matched_keywords ?? []) {
      const entry = byKeyword.get(kw) ?? { keyword: kw, threads: 0, highIntent: 0 };
      entry.threads++;
      if (row.classification === 'HIGH_INTENT') entry.highIntent++;
      byKeyword.set(kw, entry);
    }
  }

  return [...byKeyword.values()].sort((a, b) => b.highIntent - a.highIntent || b.threads - a.threads);
}
