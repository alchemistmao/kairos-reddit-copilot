import Anthropic from '@anthropic-ai/sdk';
import { claudeEnv } from './env';

let cached: Anthropic | null = null;

export function claude(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: claudeEnv().apiKey, maxRetries: 3 });
  return cached;
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
