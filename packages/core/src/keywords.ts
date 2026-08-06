import type { Keyword, RedditPost } from './types';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filtro local por keywords, rodado **antes** de qualquer chamada à Claude API
 * — é o que segura o custo (spec 3.1).
 *
 * Um termo com espaços casa como substring; um termo de palavra única casa
 * como palavra inteira, para "jobs" não casar dentro de "jobseeker".
 */
export function matchKeywords(post: RedditPost, keywords: Keyword[]): string[] {
  const haystack = normalize(`${post.title}\n${post.selftext}`);
  const matched: string[] = [];

  for (const kw of keywords) {
    if (!kw.active) continue;
    const term = normalize(kw.term);
    if (!term) continue;

    const hit = term.includes(' ')
      ? haystack.includes(term)
      : new RegExp(`(^|\\s)${escapeRegex(term)}(\\s|$)`).test(haystack);

    if (hit) matched.push(kw.term);
  }

  return matched;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
