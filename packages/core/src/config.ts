import { adminDb } from './db';
import { getSettings } from './settings';

/**
 * Configuração vive no banco, editável em /configuracoes.
 * O .env continua funcionando como fallback (útil em dev), mas o banco vence.
 *
 * Exceção incontornável: as 3 chaves do Supabase ficam em env, porque são
 * elas que abrem a conexão com o banco onde tudo isto está guardado.
 */

export const SECRET_KEYS = [
  'reddit_client_id',
  'reddit_client_secret',
  'reddit_username',
  'reddit_password',
  'reddit_user_agent',
  'anthropic_api_key',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

/** Fallback para .env, por chave — mantém dev local funcionando. */
const ENV_FALLBACK: Record<SecretKey, string> = {
  reddit_client_id: 'REDDIT_CLIENT_ID',
  reddit_client_secret: 'REDDIT_CLIENT_SECRET',
  reddit_username: 'REDDIT_USERNAME',
  reddit_password: 'REDDIT_PASSWORD',
  reddit_user_agent: 'REDDIT_USER_AGENT',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
};

let cache: { at: number; values: Partial<Record<SecretKey, string>> } | null = null;
const TTL_MS = 30_000;

export function invalidateSecretsCache(): void {
  cache = null;
}

async function loadSecrets(): Promise<Partial<Record<SecretKey, string>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;

  const values: Partial<Record<SecretKey, string>> = {};

  const { data, error } = await adminDb().from('app_secrets').select('key, value');
  if (error) throw new Error(`Falha ao ler app_secrets: ${error.message}`);

  for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
    if ((SECRET_KEYS as readonly string[]).includes(row.key) && row.value.trim() !== '') {
      values[row.key as SecretKey] = row.value;
    }
  }

  // .env preenche o que o banco não tem.
  for (const key of SECRET_KEYS) {
    if (values[key]) continue;
    const fromEnv = process.env[ENV_FALLBACK[key]];
    if (fromEnv && fromEnv.trim() !== '') values[key] = fromEnv.trim();
  }

  cache = { at: Date.now(), values };
  return values;
}

export async function getSecret(key: SecretKey): Promise<string | null> {
  const values = await loadSecrets();
  return values[key] ?? null;
}

export async function requireSecret(key: SecretKey): Promise<string> {
  const value = await getSecret(key);
  if (!value) {
    throw new Error(
      `Configuração ausente: "${key}". Preencha em /configuracoes no painel.`,
    );
  }
  return value;
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  const { error } = await adminDb()
    .from('app_secrets')
    .upsert({ key, value: value.trim() }, { onConflict: 'key' });
  if (error) throw new Error(`Falha ao gravar "${key}": ${error.message}`);
  invalidateSecretsCache();
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  const { error } = await adminDb().from('app_secrets').delete().eq('key', key);
  if (error) throw new Error(`Falha ao remover "${key}": ${error.message}`);
  invalidateSecretsCache();
}

/** Quais chaves estão preenchidas, e uma prévia mascarada — nunca o valor. */
export async function secretsStatus(): Promise<
  Array<{ key: SecretKey; filled: boolean; preview: string }>
> {
  const values = await loadSecrets();
  return SECRET_KEYS.map((key) => {
    const v = values[key];
    return {
      key,
      filled: Boolean(v),
      preview: v ? mask(key, v) : '',
    };
  });
}

function mask(key: SecretKey, value: string): string {
  // User-agent não é segredo — mostra inteiro para poder conferir o formato.
  if (key === 'reddit_user_agent' || key === 'reddit_username') return value;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)} (${value.length} chars)`;
}

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}

export async function redditConfig(): Promise<RedditConfig> {
  return {
    clientId: await requireSecret('reddit_client_id'),
    clientSecret: await requireSecret('reddit_client_secret'),
    username: await requireSecret('reddit_username'),
    password: await requireSecret('reddit_password'),
    userAgent:
      (await getSecret('reddit_user_agent')) ??
      'nodejs:kairos-reddit-copilot:0.1.0 (by /u/unknown)',
  };
}

export interface ClaudeConfig {
  apiKey: string;
  classifierModel: string;
  drafterModel: string;
}

export async function claudeConfig(): Promise<ClaudeConfig> {
  const settings = await getSettings();
  return {
    apiKey: await requireSecret('anthropic_api_key'),
    classifierModel: settings.classifier_model,
    drafterModel: settings.drafter_model,
  };
}

/** Só o user-agent, para chamadas públicas que não exigem credencial. */
export async function userAgent(): Promise<string> {
  return (
    (await getSecret('reddit_user_agent')) ??
    'nodejs:kairos-reddit-copilot:0.1.0 (by /u/unknown)'
  );
}
