import { keywordPerformance, subredditPerformance } from '@kairos/core';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireSession();
  const [subs, keywords] = await Promise.all([subredditPerformance(), keywordPerformance()]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-lg font-semibold">Por subreddit</h1>
        {subs.length === 0 ? (
          <p className="card text-sm text-muted">Sem posts ainda.</p>
        ) : (
          <div className="card divide-y divide-edge p-0">
            {subs.map((row) => (
              <div key={row.subreddit} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">r/{row.subreddit}</span>
                <span className="text-xs text-muted">
                  {row.posted} posts · {row.upvotes} upvotes · {row.replies} respostas
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Por keyword</h2>
        {keywords.length === 0 ? (
          <p className="card text-sm text-muted">Sem matches ainda.</p>
        ) : (
          <div className="card divide-y divide-edge p-0">
            {keywords.slice(0, 20).map((row) => (
              <div key={row.keyword} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{row.keyword}</span>
                <span className="text-xs text-muted">
                  {row.threads} threads · {row.highIntent} alta intenção
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
