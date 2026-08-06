'use client';

import type { SecretKey, Settings } from '@kairos/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function save(body: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; message?: string };
}

export function SecretField({
  secretKey,
  label,
  hint,
  type,
  filled,
  preview,
}: {
  secretKey: SecretKey;
  label: string;
  hint: string;
  type?: string;
  filled: boolean;
  preview: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!value.trim()) return;
    setBusy(true);
    const res = await save({ kind: 'secret', key: secretKey, value });
    setBusy(false);
    setStatus(res.ok ? 'Salvo.' : (res.message ?? 'Falhou.'));
    if (res.ok) {
      setValue('');
      router.refresh();
    }
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        {filled ? (
          <span className="chip border-emerald-500/50 text-emerald-300">preenchido</span>
        ) : (
          <span className="chip-risk">vazio</span>
        )}
      </div>

      {filled && <p className="font-mono text-[11px] text-muted">{preview}</p>}
      <p className="text-[11px] text-muted">{hint}</p>

      <div className="flex gap-2">
        <input
          type={type ?? 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={filled ? 'Substituir…' : 'Colar valor…'}
          autoComplete="off"
          className="min-h-[44px] flex-1 rounded-xl border border-edge bg-ink px-3 text-sm outline-none focus:border-accent"
        />
        <button type="button" onClick={submit} disabled={busy || !value.trim()} className="btn-ghost">
          Salvar
        </button>
      </div>

      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}

const NUMBERS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  { key: 'daily_post_limit', label: 'Máx. posts por dia', hint: 'Total, somando todos os subreddits' },
  { key: 'min_minutes_between_posts', label: 'Min. minutos entre posts', hint: 'Spec: 120' },
  { key: 'min_delay_minutes', label: 'Delay mínimo (min)', hint: 'Após aprovar' },
  { key: 'max_delay_minutes', label: 'Delay máximo (min)', hint: 'Após aprovar' },
  {
    key: 'max_mentions_per_subreddit_per_week',
    label: 'Máx. menções por subreddit/semana',
    hint: 'Spec: 1',
  },
  { key: 'poll_interval_minutes', label: 'Intervalo do polling (min)', hint: 'Spec: 10' },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    const res = await save({
      kind: 'settings',
      settings: {
        daily_post_limit: Number(form.daily_post_limit),
        min_minutes_between_posts: Number(form.min_minutes_between_posts),
        min_delay_minutes: Number(form.min_delay_minutes),
        max_delay_minutes: Number(form.max_delay_minutes),
        max_mentions_per_subreddit_per_week: Number(form.max_mentions_per_subreddit_per_week),
        poll_interval_minutes: Number(form.poll_interval_minutes),
        warming_mode: form.warming_mode,
        paused: form.paused,
        kairos_url: form.kairos_url,
        classifier_model: form.classifier_model,
        drafter_model: form.drafter_model,
        reddit_read_mode: form.reddit_read_mode,
        posting_mode: form.posting_mode,
      },
    });
    setBusy(false);
    setStatus(res.ok ? 'Salvo.' : (res.message ?? 'Falhou.'));
    if (res.ok) router.refresh();
  }

  const inputCls =
    'min-h-[44px] w-full rounded-xl border border-edge bg-ink px-3 text-sm outline-none focus:border-accent';

  return (
    <div className="card space-y-4">
      <div>
        <label className="text-sm font-medium">Modo de leitura do Reddit</label>
        <select
          value={form.reddit_read_mode}
          onChange={(e) => set('reddit_read_mode', e.target.value as Settings['reddit_read_mode'])}
          className={`${inputCls} mt-1`}
        >
          <option value="oauth">API autenticada (precisa do app aprovado)</option>
          <option value="public_json">JSON público (sem credencial, rate limit menor)</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Modo de postagem</label>
        <select
          value={form.posting_mode}
          onChange={(e) => set('posting_mode', e.target.value as Settings['posting_mode'])}
          className={`${inputCls} mt-1`}
        >
          <option value="api">Automático via API (precisa do app aprovado)</option>
          <option value="manual">Manual — a fila mostra botão copiar</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {NUMBERS.map((f) => (
          <div key={String(f.key)}>
            <label className="text-xs font-medium">{f.label}</label>
            <input
              type="number"
              min={0}
              value={String(form[f.key] ?? '')}
              onChange={(e) => set(f.key, Number(e.target.value) as never)}
              className={`${inputCls} mt-1`}
            />
            <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium">URL do Kairós (base das UTMs)</label>
        <input
          value={form.kairos_url}
          onChange={(e) => set('kairos_url', e.target.value)}
          className={`${inputCls} mt-1`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Modelo classifier</label>
          <input
            value={form.classifier_model}
            onChange={(e) => set('classifier_model', e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
        <div>
          <label className="text-xs font-medium">Modelo drafter</label>
          <input
            value={form.drafter_model}
            onChange={(e) => set('drafter_model', e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.warming_mode}
          onChange={(e) => set('warming_mode', e.target.checked)}
          className="h-5 w-5 accent-accent"
        />
        Modo warming — bloqueia toda variante com menção ao produto
      </label>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.paused}
          onChange={(e) => set('paused', e.target.checked)}
          className="h-5 w-5 accent-accent"
        />
        Pausado — nada é postado
      </label>

      <button type="button" onClick={submit} disabled={busy} className="btn-primary w-full">
        Salvar configurações
      </button>

      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}
