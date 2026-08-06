import Anthropic from '@anthropic-ai/sdk';
import { claudeConfig } from './config';

let cached: { key: string; client: Anthropic } | null = null;

/** Cliente Anthropic com a chave vinda do banco (editável em /configuracoes). */
export async function claude(): Promise<Anthropic> {
  const { apiKey } = await claudeConfig();
  if (cached && cached.key === apiKey) return cached.client;
  const client = new Anthropic({ apiKey, maxRetries: 3 });
  cached = { key: apiKey, client };
  return client;
}

/** Concatena os blocos de texto da resposta. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Extrai o primeiro objeto JSON de uma resposta em texto, tolerando cercas de
 * código e prosa em volta.
 */
export function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fallback: recorta do primeiro { até o } balanceado
  }

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error(`Resposta sem JSON: ${raw.slice(0, 300)}`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
  }

  throw new Error(`JSON incompleto na resposta: ${raw.slice(0, 300)}`);
}
