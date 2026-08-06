import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
}

export interface Session {
  userId: string;
  email: string;
}

/** Sessão atual, ou null. Também aplica o allowlist de um único e-mail. */
export async function currentSession(): Promise<Session | null> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();

  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const allowed = ownerEmail();
  if (allowed && email !== allowed) return null;

  return { userId: user.id, email };
}

/** Guarda para páginas: redireciona para /login se não autenticado. */
export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect('/login');
  return session;
}
