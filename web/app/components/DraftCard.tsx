'use client';

import type { QueueItem, Variant } from '@kairos/core';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const VARIANT_LABEL: Record<Variant, string> = {
  help_only: 'Ajuda pura',
  soft_mention: 'Menção suave',
};

const INTENT_STYLE: Record<string, string> = {
  HIGH_INTENT: 'border-accent/60 bg-accent/10 text-accent',
  HELP_ONLY: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
};

export function DraftCard({ item }: { item: QueueItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const variants = item.drafts.map((d) => d.variant);
  const [active, setActive] = useState<Variant>(
    variants.includes('help_only') ? 'help_only' : (variants[0] ?? 'help_only'),
  );

  const draft = item.drafts.find((d) => d.variant === active) ?? item.drafts[0];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft?.edited_content ?? draft?.content ?? '');
  const [message, setMessage] = useState<string | null>(null);

  if (!draft) return null;

  function selectVariant(v: Variant) {
    const next = item.drafts.find((d) => d.variant === v);
    if (!next) return;
    setActive(v);
    setEditing(false);
    setMessage(null);
    setText(next.edited_content ?? next.content);
  }

  async function act(action: 'approve' | 'discard' | 'save', content?: string) {
    setMessage(null);
    const res = await fetch(`/api/drafts/${draft!.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, content }),
    });
    const json = (await res.json()) as { ok: boolean; message?: string };

    if (!res.ok || !json.ok) {
      setMessage(json.message ?? 'Ação recusada.');
      return;
    }

    setMessage(json.message ?? null);
    startTransition(() => router.refresh());
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <article className="card space-y-3">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">r/{item.subreddit.name}</span>
          <span
            className={`chip border ${INTENT_STYLE[item.thread.classification] ?? ''}`}
          >
            {item.thread.classification === 'HIGH_INTENT' ? 'alta intenção' : 'ajuda'}
          </span>
          {!item.subreddit.allows_links && <span className="chip">sem links</span>}
        </div>

        <a
          href={item.thread.permalink}
          target="_blank"
          rel="noreferrer"
          className="block text-base font-medium leading-snug hover:underline"
        >
          {item.thread.title}
        </a>

        <p className="text-xs text-muted">
          u/{item.thread.author} · {item.thread.num_comments} comentários ·{' '}
          {item.thread.matched_keywords.join(', ') || 'sem keyword'}
        </p>

        {item.thread.classification_reason && (
          <p className="text-xs leading-relaxed text-muted">
            {item.thread.classification_reason}
          </p>
        )}
      </header>

      <div className="flex gap-2">
        {(['help_only', 'soft_mention'] as const)
          .filter((v) => variants.includes(v))
          .map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => selectVariant(v)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                active === v ? 'bg-slate-100 text-ink' : 'border border-edge text-muted'
              }`}
            >
              {VARIANT_LABEL[v]}
            </button>
          ))}
      </div>

      {draft.risk_flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {draft.risk_flags.map((flag) => (
            <span key={flag} className="chip-risk">
              ⚠ {flag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full rounded-xl border border-edge bg-ink p-3 text-sm leading-relaxed outline-none focus:border-accent"
        />
      ) : (
        <p className="whitespace-pre-wrap rounded-xl bg-ink p-3 text-sm leading-relaxed text-slate-200">
          {text}
        </p>
      )}

      <p className="text-[11px] text-muted">{wordCount} palavras</p>

      {message && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          {message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => act('approve', editing ? text : undefined)}
          className="btn-primary col-span-2"
        >
          Aprovar e postar
        </button>

        {editing ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => act('save', text).then(() => setEditing(false))}
            className="btn-ghost"
          >
            Salvar edição
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost">
            Editar
          </button>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={() => act('discard')}
          className="btn-ghost"
        >
          Descartar
        </button>
      </div>
    </article>
  );
}
