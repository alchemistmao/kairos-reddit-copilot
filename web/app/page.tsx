import { getSettings, listQueue } from '@kairos/core';
import { requireSession } from '@/lib/auth';
import { DraftCard } from './components/DraftCard';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  await requireSession();

  const [items, settings] = await Promise.all([listQueue(), getSettings()]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Fila de aprovação</h1>
          <p className="text-sm text-muted">
            {items.length} {items.length === 1 ? 'thread aguardando' : 'threads aguardando'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          {settings.warming_mode && <span className="chip">modo warming</span>}
          {settings.paused && <span className="chip-risk">pausado</span>}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="card text-sm text-muted">
          Nada na fila. O worker roda a cada {process.env.POLL_INTERVAL_MINUTES ?? 10} minutos.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <DraftCard key={item.thread.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
