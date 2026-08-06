import {
  appEnv,
  ensureSeed,
  errMessage,
  log,
  publishDueDrafts,
  refreshMetrics,
  runPollCycle,
} from '@kairos/core';

const env = appEnv();

let shuttingDown = false;
let pollRunning = false;
let publishRunning = false;

/** Ciclo de escuta: polling → classifier → drafter → Supabase, + métricas. */
async function pollTick(): Promise<void> {
  if (pollRunning || shuttingDown) return;
  pollRunning = true;
  try {
    await runPollCycle();
    const metrics = await refreshMetrics();
    if (metrics.recorded > 0) log.info('Métricas atualizadas', { ...metrics });
  } catch (e) {
    log.error('Ciclo de polling falhou', { error: errMessage(e) });
  } finally {
    pollRunning = false;
  }
}

/** Despachante dos posts agendados (delay humano de 1–15min já embutido). */
async function publishTick(): Promise<void> {
  if (publishRunning || shuttingDown) return;
  publishRunning = true;
  try {
    const summary = await publishDueDrafts();
    if (summary.due > 0) log.info('Despacho concluído', { ...summary });
  } catch (e) {
    log.error('Despacho falhou', { error: errMessage(e) });
  } finally {
    publishRunning = false;
  }
}

async function main(): Promise<void> {
  log.info('Kairós Reddit Copilot worker iniciando', {
    pollIntervalMinutes: env.pollIntervalMinutes,
    publishTickSeconds: env.publishTickSeconds,
    runOnce: env.runOnce,
  });

  await ensureSeed();

  // RUN_ONCE=true permite usar o worker como cron job do Railway em vez de
  // processo contínuo. Por padrão roda contínuo com cron interno de 10min.
  if (env.runOnce) {
    await pollTick();
    await publishTick();
    log.info('RUN_ONCE concluído');
    return;
  }

  await pollTick();
  await publishTick();

  const pollTimer = setInterval(pollTick, Math.max(1, env.pollIntervalMinutes) * 60_000);
  const publishTimer = setInterval(publishTick, Math.max(15, env.publishTickSeconds) * 1000);

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Encerrando worker', { signal });
    clearInterval(pollTimer);
    clearInterval(publishTimer);
    // Dá um instante para o ciclo em voo terminar antes de sair.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  log.error('Worker abortou', { error: errMessage(e) });
  process.exit(1);
});
