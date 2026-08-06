import { ensureSeed, errMessage, log } from '@kairos/core';

ensureSeed()
  .then(() => log.info('Seed aplicado'))
  .catch((e) => {
    log.error('Seed falhou', { error: errMessage(e) });
    process.exit(1);
  });
