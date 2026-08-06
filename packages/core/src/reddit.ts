import { redditEnv } from './env';
import { log } from './logger';
import type { RedditPost } from './types';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';

interface Token {
  accessToken: string;
  expiresAt: number;
}

let token: Token | null = null;

/**
 * OAuth de "script app": grant_type=password com as credenciais da própria
 * conta. Não há refresh token nesse fluxo — o access token é renovado
 * pedindo outro.
 */
async function getToken(): Promise<string> {
  const now = Date.now();
  if (token && token.expiresAt - 60_000 > now) return token.accessToken;

  const env = redditEnv();
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'password',
    username: env.username,
    password: env.password,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': env.userAgent,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Reddit OAuth falhou: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) {
    throw new Error(`Reddit OAuth sem access_token: ${JSON.stringify(json)}`);
  }

  token = {
    accessToken: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return token.accessToken;
}

/** Invalida o token em cache (usado quando a API responde 401). */
function resetToken() {
  token = null;
}

async function apiFetch(path: string, init: RequestInit = {}, retryOn401 = true): Promise<Response> {
  const env = redditEnv();
  const accessToken = await getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': env.userAgent,
    },
  });

  if (res.status === 401 && retryOn401) {
    resetToken();
    return apiFetch(path, init, false);
  }

  if (res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error(`Reddit rate limit atingido (reset em ${reset ?? '?'}s)`);
  }

  return res;
}

interface ListingChild {
  data: {
    id: string;
    subreddit: string;
    title: string;
    selftext?: string;
    author: string;
    url: string;
    permalink: string;
    created_utc: number;
    score: number;
    num_comments: number;
    stickied?: boolean;
    removed_by_category?: string | null;
  };
}

/** GET /r/{sub}/new — posts mais recentes de um subreddit. */
export async function fetchNewPosts(subreddit: string, limit = 50): Promise<RedditPost[]> {
  const res = await apiFetch(`/r/${encodeURIComponent(subreddit)}/new?limit=${limit}&raw_json=1`);
  if (!res.ok) {
    throw new Error(`GET /r/${subreddit}/new falhou: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data?: { children?: ListingChild[] } };
  const children = json.data?.children ?? [];

  return children
    .map((c) => c.data)
    .filter((d) => !d.stickied && !d.removed_by_category && d.author !== '[deleted]')
    .map((d) => ({
      id: d.id,
      subreddit: d.subreddit,
      title: d.title ?? '',
      selftext: d.selftext ?? '',
      author: d.author ?? '',
      url: d.url ?? '',
      permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : '',
      created_utc: d.created_utc ?? 0,
      score: d.score ?? 0,
      num_comments: d.num_comments ?? 0,
    }));
}

export interface PostedComment {
  id: string;
  permalink: string;
}

/** POST /api/comment — responde a um post (thing_id = t3_<postId>). */
export async function postComment(postId: string, text: string): Promise<PostedComment> {
  const body = new URLSearchParams({
    api_type: 'json',
    thing_id: `t3_${postId}`,
    text,
  });

  const res = await apiFetch('/api/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`POST /api/comment falhou: ${res.status} ${raw}`);
  }

  let json: {
    json?: {
      errors?: unknown[][];
      data?: { things?: Array<{ data?: { id?: string; name?: string; permalink?: string } }> };
    };
  };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta inesperada do Reddit ao comentar: ${raw.slice(0, 300)}`);
  }

  const errors = json.json?.errors ?? [];
  if (errors.length > 0) {
    throw new Error(`Reddit recusou o comentário: ${JSON.stringify(errors)}`);
  }

  const thing = json.json?.data?.things?.[0]?.data;
  if (!thing?.id) {
    throw new Error(`Comentário sem id na resposta: ${raw.slice(0, 300)}`);
  }

  return {
    id: thing.id,
    permalink: thing.permalink ? `https://www.reddit.com${thing.permalink}` : '',
  };
}

export interface CommentStats {
  score: number;
  replies: number;
}

/** GET /api/info — score e número de respostas de um comentário já postado. */
export async function fetchCommentStats(commentId: string): Promise<CommentStats | null> {
  const res = await apiFetch(`/api/info?id=t1_${commentId}&raw_json=1`);
  if (!res.ok) {
    log.warn('Falha ao buscar métricas do comentário', { commentId, status: res.status });
    return null;
  }

  const json = (await res.json()) as {
    data?: { children?: Array<{ data?: { score?: number; num_comments?: number } }> };
  };
  const d = json.data?.children?.[0]?.data;
  if (!d) return null;

  return { score: d.score ?? 0, replies: d.num_comments ?? 0 };
}

/** Karma total da conta autenticada — usado pelo modo warming. */
export async function fetchAccountKarma(): Promise<number | null> {
  const res = await apiFetch('/api/v1/me');
  if (!res.ok) return null;
  const json = (await res.json()) as { link_karma?: number; comment_karma?: number };
  return (json.link_karma ?? 0) + (json.comment_karma ?? 0);
}
