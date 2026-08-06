import { claude, parseJson, textOf } from './claude';
import { claudeConfig } from './config';
import { getSettings } from './settings';
import { loadPrompt, render } from './prompts';
import type { ClassifierResult, DrafterResult, RedditPost, Subreddit } from './types';

/** UTM por thread, conforme spec 3.6. */
export async function utmUrl(postId: string): Promise<string> {
  const base = (await getSettings()).kairos_url.replace(/\/+$/, '');
  return `${base}?utm_source=reddit&utm_content=${encodeURIComponent(postId)}`;
}

/**
 * Gera as duas variantes (help_only e soft_mention) com claude-sonnet-4-6.
 * As regras fixas de tom vivem em prompts/drafter.md, carregado em runtime.
 */
export async function draftReplies(
  post: RedditPost,
  subreddit: Pick<Subreddit, 'name' | 'allows_links' | 'rules_summary'>,
  classification: ClassifierResult,
): Promise<DrafterResult> {
  const prompt = render(loadPrompt('drafter'), {
    SUBREDDIT: subreddit.name,
    ALLOWS_LINKS: String(subreddit.allows_links),
    SUBREDDIT_RULES: subreddit.rules_summary || '(sem regras registradas — seja conservador)',
    INTENT: classification.intent,
    SUGGESTED_ANGLE: classification.suggested_angle || '(nenhum)',
    TITLE: post.title,
    AUTHOR: post.author,
    BODY: post.selftext.slice(0, 8000) || '(post sem corpo)',
    UTM_URL: await utmUrl(post.id),
  });

  const cfg = await claudeConfig();
  const client = await claude();

  const message = await client.messages.create({
    model: cfg.drafterModel,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  if (message.stop_reason === 'refusal') {
    throw new Error('Drafter recusado pelo modelo');
  }

  const parsed = parseJson<DrafterResult>(textOf(message));
  const helpOnly = (parsed.help_only ?? '').trim();
  const softMention = (parsed.soft_mention ?? '').trim();

  if (!helpOnly || !softMention) {
    throw new Error('Drafter retornou variante vazia');
  }

  return {
    help_only: helpOnly,
    soft_mention: softMention,
    mention_included: Boolean(parsed.mention_included),
    notes: (parsed.notes ?? '').slice(0, 500),
  };
}

const URL_RE = /https?:\/\/\S+/i;

/**
 * Badge de risco (spec 3.4): sinaliza quando a menção ao Kairós violaria as
 * regras do subreddit, ou quando o modo warming está ativo.
 */
export function riskFlags(args: {
  variant: 'help_only' | 'soft_mention';
  content: string;
  allowsLinks: boolean;
  warmingMode: boolean;
  mentionIncluded: boolean;
}): string[] {
  const flags: string[] = [];
  const hasLink = URL_RE.test(args.content);
  const mentionsKairos = /kair[oó]s/i.test(args.content);

  if (args.variant === 'help_only') {
    if (hasLink) flags.push('help_only_com_link');
    if (mentionsKairos) flags.push('help_only_menciona_produto');
    return flags;
  }

  if (hasLink && !args.allowsLinks) flags.push('link_proibido_no_subreddit');
  if (args.warmingMode && (mentionsKairos || hasLink)) flags.push('modo_warming_ativo');
  if (args.mentionIncluded && !mentionsKairos) flags.push('menção_declarada_mas_ausente');
  if (args.content.split(/\s+/).length > 260) flags.push('longo_demais');

  return flags;
}
