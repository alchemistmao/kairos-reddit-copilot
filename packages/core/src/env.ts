function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Veja .env.example.`,
    );
  }
  return v.trim();
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

/** Credenciais do Supabase com service_role — worker e rotas de servidor do web. */
export function supabaseEnv() {
  return {
    url: process.env.SUPABASE_URL?.trim() || req('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function redditEnv() {
  return {
    clientId: req('REDDIT_CLIENT_ID'),
    clientSecret: req('REDDIT_CLIENT_SECRET'),
    username: req('REDDIT_USERNAME'),
    password: req('REDDIT_PASSWORD'),
    userAgent: opt(
      'REDDIT_USER_AGENT',
      'nodejs:kairos-reddit-copilot:0.1.0 (by /u/unknown)',
    ),
  };
}

export function claudeEnv() {
  return {
    apiKey: req('ANTHROPIC_API_KEY'),
    classifierModel: opt('CLASSIFIER_MODEL', 'claude-haiku-4-5'),
    drafterModel: opt('DRAFTER_MODEL', 'claude-sonnet-4-6'),
  };
}

export function appEnv() {
  return {
    ownerEmail: opt('OWNER_EMAIL', '').toLowerCase(),
    kairosUrl: opt('KAIROS_URL', 'https://kairos.com'),
    cronSecret: opt('CRON_SECRET', ''),
    pollIntervalMinutes: num('POLL_INTERVAL_MINUTES', 10),
    publishTickSeconds: num('PUBLISH_TICK_SECONDS', 60),
    runOnce: bool('RUN_ONCE', false),
    promptsDir: opt('PROMPTS_DIR', ''),
  };
}
