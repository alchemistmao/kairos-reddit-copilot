import { getSettings, secretsStatus, type SecretKey } from '@kairos/core';
import { requireSession } from '@/lib/auth';
import { SecretField, SettingsForm } from './forms';

export const dynamic = 'force-dynamic';

const SECRET_LABEL: Record<SecretKey, { label: string; hint: string; type?: string }> = {
  reddit_client_id: {
    label: 'Reddit — client ID',
    hint: 'String de ~22 chars abaixo do nome do app em reddit.com/prefs/apps',
  },
  reddit_client_secret: {
    label: 'Reddit — client secret',
    hint: 'Ao lado do rótulo "secret"',
    type: 'password',
  },
  reddit_username: { label: 'Reddit — usuário', hint: 'Sem o prefixo "u/"' },
  reddit_password: { label: 'Reddit — senha', hint: 'A conta não pode ter 2FA', type: 'password' },
  reddit_user_agent: {
    label: 'Reddit — User-Agent',
    hint: 'Precisa conter seu usuário real, ou o Reddit bloqueia',
  },
  anthropic_api_key: {
    label: 'Anthropic — API key',
    hint: 'console.anthropic.com/settings/keys',
    type: 'password',
  },
};

export default async function ConfigPage() {
  await requireSession();
  const [settings, secrets] = await Promise.all([getSettings(), secretsStatus()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Configurações</h1>
        <p className="mt-1 text-sm text-muted">
          Tudo é gravado no banco. Nada aqui precisa de redeploy — o worker relê a cada ciclo.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Credenciais</h2>
        <p className="text-xs text-muted">
          Guardadas em tabela que só o servidor lê. O navegador nunca recebe o valor — só a
          prévia mascarada abaixo.
        </p>
        <div className="space-y-3">
          {secrets.map((s) => (
            <SecretField
              key={s.key}
              secretKey={s.key}
              label={SECRET_LABEL[s.key].label}
              hint={SECRET_LABEL[s.key].hint}
              type={SECRET_LABEL[s.key].type}
              filled={s.filled}
              preview={s.preview}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Operação e guard-rails
        </h2>
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}
