import { classifyThread } from './classifier';
import { adminDb } from './db';
import { draftReplies, riskFlags } from './drafter';
import { matchKeywords } from './keywords';
import { errMessage, log } from './logger';
import { fetchNewPosts } from './reddit';
import { getSettings } from './settings';
import type { Keyword, RedditPost, Subreddit, Thread } from './types';

export interface PollSummary {
  subredditsChecked: number;
  postsSeen: number;
  keywordMatches: number;
  newThreads: number;
  classified: number;
  drafted: number;
  skipped: number;
  errors: number;
}

/**
 * Um ciclo completo do listener (spec 3.1–3.3):
 *   polling → dedupe por post_id → filtro local de keywords → classifier
 *   (haiku) → drafter (sonnet, 2 variantes) → gravação no Supabase.
 */
export async function runPollCycle(): Promise<PollSummary> {
  const db = adminDb();
  const summary: PollSummary = {
    subredditsChecked: 0,
    postsSeen: 0,
    keywordMatches: 0,
    newThreads: 0,
    classified: 0,
    drafted: 0,
    skipped: 0,
    errors: 0,
  };

  const settings = await getSettings();

  const { data: subs, error: subsErr } = await db
    .from('subreddits')
    .select('*')
    .eq('active', true);
  if (subsErr) throw new Error(`Falha ao ler subreddits: ${subsErr.message}`);

  const { data: kws, error: kwsErr } = await db
    .from('keywords')
    .select('*')
    .eq('active', true);
  if (kwsErr) throw new Error(`Falha ao ler keywords: ${kwsErr.message}`);

  const subreddits = (subs ?? []) as Subreddit[];
  const keywords = (kws ?? []) as Keyword[];

  if (subreddits.length === 0) {
    log.warn('Nenhum subreddit ativo — nada a fazer');
    return summary;
  }

  for (const sub of subreddits) {
    summary.subredditsChecked++;

    let posts: RedditPost[];
    try {
      posts = await fetchNewPosts(sub.name);
    } catch (e) {
      summary.errors++;
      log.error('Falha no polling do subreddit', { subreddit: sub.name, error: errMessage(e) });
      continue;
    }

    summary.postsSeen += posts.length;

    // Dedupe por reddit_post_id, em lote, antes de gastar qualquer token.
    const ids = posts.map((p) => p.id);
    const { data: known, error: knownErr } = await db
      .from('threads')
      .select('reddit_post_id')
      .in('reddit_post_id', ids.length > 0 ? ids : ['__none__']);
    if (knownErr) throw new Error(`Falha no dedupe: ${knownErr.message}`);

    const seen = new Set((known ?? []).map((r) => (r as { reddit_post_id: string }).reddit_post_id));

    for (const post of posts) {
      if (seen.has(post.id)) continue;

      const matched = matchKeywords(post, keywords);
      if (matched.length === 0) continue;
      summary.keywordMatches++;

      try {
        const thread = await insertThread(post, sub, matched);
        summary.newThreads++;

        const classification = await classifyThread(post, matched);
        summary.classified++;

        if (classification.intent === 'SKIP') {
          await db
            .from('threads')
            .update({
              classification: 'SKIP',
              classification_reason: classification.reason,
              suggested_angle: '',
              status: 'skipped',
            })
            .eq('id', thread.id);
          summary.skipped++;
          continue;
        }

        await db
          .from('threads')
          .update({
            classification: classification.intent,
            classification_reason: classification.reason,
            suggested_angle: classification.suggested_angle,
            status: 'classified',
          })
          .eq('id', thread.id);

        const drafts = await draftReplies(post, sub, classification);

        const rows = (['help_only', 'soft_mention'] as const).map((variant) => ({
          thread_id: thread.id,
          variant,
          content: variant === 'help_only' ? drafts.help_only : drafts.soft_mention,
          status: 'pending' as const,
          risk_flags: riskFlags({
            variant,
            content: variant === 'help_only' ? drafts.help_only : drafts.soft_mention,
            allowsLinks: sub.allows_links,
            warmingMode: settings.warming_mode,
            mentionIncluded: drafts.mention_included,
          }),
        }));

        const { error: draftErr } = await db
          .from('drafts')
          .upsert(rows, { onConflict: 'thread_id,variant' });
        if (draftErr) throw new Error(`Falha ao gravar rascunhos: ${draftErr.message}`);

        await db.from('threads').update({ status: 'drafted' }).eq('id', thread.id);
        summary.drafted++;

        log.info('Thread processada', {
          subreddit: sub.name,
          postId: post.id,
          intent: classification.intent,
        });
      } catch (e) {
        summary.errors++;
        log.error('Falha ao processar thread', {
          subreddit: sub.name,
          postId: post.id,
          error: errMessage(e),
        });
        await db
          .from('threads')
          .update({ status: 'error', error: errMessage(e).slice(0, 500) })
          .eq('reddit_post_id', post.id);
      }
    }
  }

  log.info('Ciclo de polling concluído', { ...summary });
  return summary;
}

async function insertThread(
  post: RedditPost,
  sub: Subreddit,
  matched: string[],
): Promise<Thread> {
  const { data, error } = await adminDb()
    .from('threads')
    .upsert(
      {
        reddit_post_id: post.id,
        subreddit_id: sub.id,
        title: post.title,
        body: post.selftext,
        author: post.author,
        url: post.url,
        permalink: post.permalink,
        created_utc: new Date(post.created_utc * 1000).toISOString(),
        score: post.score,
        num_comments: post.num_comments,
        matched_keywords: matched,
        status: 'new',
      },
      { onConflict: 'reddit_post_id' },
    )
    .select('*')
    .single();

  if (error) throw new Error(`Falha ao gravar thread: ${error.message}`);
  return data as Thread;
}
