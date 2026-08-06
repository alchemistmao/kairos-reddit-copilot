import { adminDb, approveDraft, errMessage, log } from '@kairos/core';
import { NextResponse, type NextRequest } from 'next/server';
import { currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface Body {
  action?: 'approve' | 'discard' | 'save';
  content?: string;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

  const draftId = params.id;
  const content = typeof body.content === 'string' ? body.content.trim() : undefined;

  try {
    switch (body.action) {
      case 'approve': {
        const result = await approveDraft(draftId, content);
        if (!result.ok) {
          return NextResponse.json(
            { ok: false, message: result.verdict?.reason ?? 'Bloqueado pelos guard-rails' },
            { status: 409 },
          );
        }

        const when = new Date(result.scheduledAt!);
        const minutes = Math.max(1, Math.round((when.getTime() - Date.now()) / 60_000));
        return NextResponse.json({
          ok: true,
          message: `Agendado para daqui a ~${minutes} min (${when.toLocaleTimeString('pt-BR')}).`,
          scheduledAt: result.scheduledAt,
        });
      }

      case 'save': {
        if (content === undefined) {
          return NextResponse.json({ ok: false, message: 'Conteúdo ausente' }, { status: 400 });
        }
        const { error } = await adminDb()
          .from('drafts')
          .update({ edited_content: content, status: 'saved' })
          .eq('id', draftId)
          .in('status', ['pending', 'saved']);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, message: 'Edição salva.' });
      }

      case 'discard': {
        const { error } = await adminDb()
          .from('drafts')
          .update({ status: 'discarded' })
          .eq('id', draftId)
          .in('status', ['pending', 'saved']);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, message: 'Descartado.' });
      }

      default:
        return NextResponse.json({ ok: false, message: 'Ação desconhecida' }, { status: 400 });
    }
  } catch (e) {
    log.error('Ação de rascunho falhou', { draftId, action: body.action, error: errMessage(e) });
    return NextResponse.json({ ok: false, message: errMessage(e) }, { status: 500 });
  }
}
