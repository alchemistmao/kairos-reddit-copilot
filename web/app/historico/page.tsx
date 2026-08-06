import { listHistory } from '@kairos/core';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'agendado',
  posted: 'postado',
  failed: 'falhou',
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  posted: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  failed: 'border-red-500/50 bg-red-500/10 text-red-200',
};

export default async function HistoryPage() {
  await requireSession();
  const items = await listHistory();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Histórico</h1>

      {items.length === 0 ? (
        <p className="card text-sm text-muted">Nada postado ainda.</p>
      ) : (
        items.map((item) =>
          item.drafts.map((draft) => (
            <article key={draft.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">r/{item.subreddit.name}</span>
                <span className={`chip border ${STATUS_STYLE[draft.status] ?? ''}`}>
                  {STATUS_LABEL[draft.status] ?? draft.status}
                </span>
                <span className="chip">{draft.variant}</span>
              </div>

              <a
                href={draft.reddit_permalink || item.thread.permalink}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium hover:underline"
              >
                {item.thread.title}
              </a>

              <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                {draft.edited_content ?? draft.content}
              </p>

              <p className="text-[11px] text-muted">
                {draft.posted_at
                  ? `postado em ${new Date(draft.posted_at).toLocaleString('pt-BR')}`
                  : draft.scheduled_at
                    ? `agendado para ${new Date(draft.scheduled_at).toLocaleString('pt-BR')}`
                    : ''}
                {draft.error ? ` · ${draft.error}` : ''}
              </p>
            </article>
          )),
        )
      )}
    </div>
  );
}
