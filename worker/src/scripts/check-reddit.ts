import { fetchAccountKarma, fetchNewPosts, getSettings, redditConfig } from '@kairos/core';

/**
 * Verificação de ponta a ponta das credenciais do Reddit.
 * Responde a única pergunta que importa: o script app funciona ou não?
 *
 *   node --env-file=.env worker/dist/scripts/check-reddit.js
 */
async function main(): Promise<void> {
  const settings = await getSettings();
  const env = await redditConfig();

  console.log('Modo leitura: ' + settings.reddit_read_mode);

  console.log('Conta:      u/' + env.username);
  console.log('User-Agent: ' + env.userAgent);
  console.log('client_id:  ' + env.clientId.slice(0, 4) + '…(' + env.clientId.length + ' chars)');
  console.log('');

  process.stdout.write('1/3 OAuth (grant_type=password)... ');
  const karma = await fetchAccountKarma();
  console.log('OK');

  process.stdout.write('2/3 Karma da conta............... ');
  console.log(karma === null ? 'não retornado' : String(karma));

  process.stdout.write('3/3 GET /r/careerchange/new...... ');
  const posts = await fetchNewPosts('careerchange', 3);
  console.log(posts.length + ' posts');

  if (posts[0]) {
    console.log('\nPost mais recente lido:');
    console.log('  ' + posts[0].title.slice(0, 90));
  }

  console.log('\nCREDENCIAIS FUNCIONANDO. Pode seguir.');

  if (karma !== null && karma < 100) {
    console.log(
      `\nAviso: karma ${karma} (<100). O modo warming vai bloquear qualquer\n` +
        'variante soft_mention até você desligá-lo. Respostas help_only funcionam normal.',
    );
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('\nFALHOU: ' + msg + '\n');

  if (msg.includes('401') || msg.includes('invalid_grant')) {
    console.error('Causa provável: usuário/senha errados, ou 2FA ligado na conta.');
  } else if (msg.includes('403')) {
    console.error(
      'Causa provável: app não é do tipo "script", ou client_id/secret trocados,\n' +
        'ou a conta não tem acesso à API liberado.',
    );
  } else if (msg.toLowerCase().includes('user-agent')) {
    console.error('Causa provável: REDDIT_USER_AGENT genérico. Coloque seu usuário real nele.');
  }

  process.exit(1);
});
