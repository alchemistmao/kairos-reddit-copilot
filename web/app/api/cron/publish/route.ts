import { errMessage, log, publishDueDrafts } from '@kairos/core';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Despachante alternativo dos posts agendados, para quem preferir Vercel Cron
 * em vez do tick interno do worker. Protegido por CRON_SECRET (a Vercel envia
 * `Authorization: Bearer $CRON_SECRET`).
 */
export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  if (!secret) {
    return NextResponse.json({ ok: false, message: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : request.nextUrl.searchParams.get('secret');
  if (provided !== secret) {
    return NextResponse.json({ ok: false, message: 'Não autorizado' }, { status: 401 });
  }

  try {
    const summary = await publishDueDrafts();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    log.error('Cron de publicação falhou', { error: errMessage(e) });
    return NextResponse.json({ ok: false, message: errMessage(e) }, { status: 500 });
  }
}
