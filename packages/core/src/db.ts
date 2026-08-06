import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

let cached: SupabaseClient | null = null;

/**
 * Cliente com service_role. Ignora RLS por design — use só em código de
 * servidor (worker e route handlers), nunca no browser.
 */
export function adminDb(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceRoleKey } = supabaseEnv();
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error('Consulta retornou nulo');
  return res.data;
}
