import { adminDb } from './db';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: true,
  daily_post_limit: 3,
  min_minutes_between_posts: 120,
  min_delay_minutes: 1,
  max_delay_minutes: 15,
  max_mentions_per_subreddit_per_week: 1,
  warming_mode: true,
  paused: false,
  kairos_url: 'https://kairos.com',
  classifier_model: 'claude-haiku-4-5',
  drafter_model: 'claude-sonnet-4-6',
  poll_interval_minutes: 10,
  reddit_read_mode: 'oauth',
  posting_mode: 'api',
  updated_at: new Date(0).toISOString(),
};

/** Lê a linha única de settings, caindo nos defaults da spec se ela não existir. */
export async function getSettings(): Promise<Settings> {
  const { data, error } = await adminDb()
    .from('settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler settings: ${error.message}`);
  return (data as Settings | null) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const { data, error } = await adminDb()
    .from('settings')
    .upsert({ id: true, ...patch })
    .select('*')
    .single();

  if (error) throw new Error(`Falha ao gravar settings: ${error.message}`);
  return data as Settings;
}
