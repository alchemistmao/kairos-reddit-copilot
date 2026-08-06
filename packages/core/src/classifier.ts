import { claude, parseJson, textOf } from './claude';
import { claudeConfig } from './config';
import { loadPrompt, render } from './prompts';
import type { ClassifierResult, RedditPost } from './types';

const VALID = new Set(['HIGH_INTENT', 'HELP_ONLY', 'SKIP']);

/** Classifica uma thread com claude-haiku-4-5 (barato, filtra ~90% antes do sonnet). */
export async function classifyThread(
  post: RedditPost,
  matchedKeywords: string[],
): Promise<ClassifierResult> {
  const prompt = render(loadPrompt('classifier'), {
    SUBREDDIT: post.subreddit,
    KEYWORDS: matchedKeywords.join(', ') || '(nenhuma)',
    TITLE: post.title,
    BODY: post.selftext.slice(0, 6000) || '(post sem corpo)',
  });

  const cfg = await claudeConfig();
  const client = await claude();

  const message = await client.messages.create({
    model: cfg.classifierModel,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  if (message.stop_reason === 'refusal') {
    return { intent: 'SKIP', reason: 'Classificação recusada pelo modelo', suggested_angle: '' };
  }

  const parsed = parseJson<ClassifierResult>(textOf(message));
  if (!VALID.has(parsed.intent)) {
    return {
      intent: 'SKIP',
      reason: `Classificação inválida do modelo: ${String(parsed.intent)}`,
      suggested_angle: '',
    };
  }

  return {
    intent: parsed.intent,
    reason: (parsed.reason ?? '').slice(0, 500),
    suggested_angle: (parsed.suggested_angle ?? '').slice(0, 300),
  };
}
