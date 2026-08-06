import {
  SECRET_KEYS,
  errMessage,
  log,
  setSecret,
  updateSettings,
  type SecretKey,
  type Settings,
} from '@kairos/core';
import { NextResponse, type NextRequest } from 'next/server';
import { currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Body =
  | { kind: 'secret'; key: string; value: string }
  | { kind: 'settings'; settings: Partial<Settings> };

/** Campos de settings que a tela pode gravar. Nada fora desta lista passa. */
const ALLOWED: Array<keyof Settings> = [
  'daily_post_limit',
  'min_minutes_between_posts',
  'min_delay_minutes',
  'max_delay_minutes',
  'max_mentions_per_subreddit_per_week',
  'poll_interval_minutes',
  'warming_mode',
  'paused',
  'kairos_url',
  'classifier_model',
  'drafter_model',
  'reddit_read_mode',
  'posting_mode',
];

export async function POST(request: NextRequest) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Não autenticado' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 });
  }

  try {
    if (body.kind === 'secret') {
      if (!(SECRET_KEYS as readonly string[]).includes(body.key)) {
        return NextResponse.json({ ok: false, message: 'Chave desconhecida' }, { status: 400 });
      }
      const value = String(body.value ?? '').trim();
      if (!value) {
        return NextResponse.json({ ok: false, message: 'Valor vazio' }, { status: 400 });
      }
      await setSecret(body.key as SecretKey, value);
      // Nunca ecoa o valor de volta.
      log.info('Credencial atualizada', { key: body.key });
      return NextResponse.json({ ok: true });
    }

    if (body.kind === 'settings') {
      const patch: Partial<Settings> = {};
      for (const key of ALLOWED) {
        const v = body.settings?.[key];
        if (v !== undefined) (patch as Record<string, unknown>)[key] = v;
      }

      if (
        patch.min_delay_minutes !== undefined &&
        patch.max_delay_minutes !== undefined &&
        patch.min_delay_minutes > patch.max_delay_minutes
      ) {
        return NextResponse.json(
          { ok: false, message: 'Delay mínimo não pode ser maior que o máximo' },
          { status: 400 },
        );
      }

      await updateSettings(patch);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, message: 'Requisição desconhecida' }, { status: 400 });
  } catch (e) {
    log.error('Falha ao gravar configuração', { error: errMessage(e) });
    return NextResponse.json({ ok: false, message: errMessage(e) }, { status: 500 });
  }
}
