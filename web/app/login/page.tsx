import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function sendMagicLink(formData: FormData) {
  'use server';

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const owner = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();

  if (owner && email !== owner) {
    redirect('/login?erro=nao_autorizado');
  }

  const host = headers().get('x-forwarded-host') ?? headers().get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';

  const { error } = await supabaseServer().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/callback` },
  });

  redirect(error ? `/login?erro=${encodeURIComponent(error.message)}` : '/login?enviado=1');
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string; enviado?: string };
}) {
  return (
    <div className="mt-16 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-muted">
          Acesso restrito. Um link de login é enviado por e-mail.
        </p>
      </div>

      {searchParams.enviado && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Link enviado. Confira sua caixa de entrada.
        </p>
      )}

      {searchParams.erro && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {searchParams.erro === 'nao_autorizado'
            ? 'Esse e-mail não tem acesso.'
            : searchParams.erro}
        </p>
      )}

      <form action={sendMagicLink} className="space-y-3">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          className="w-full rounded-xl border border-edge bg-panel px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="btn-primary w-full">
          Enviar link
        </button>
      </form>
    </div>
  );
}
