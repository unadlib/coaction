import { create } from '@coaction/react';
import { logger } from '@coaction/logger';

import { counter, type Counter } from './counter';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useStore = create<Counter>(counter, {
  worker,
  middlewares: [
    logger({
      collapsed: false
    })
  ]
});
