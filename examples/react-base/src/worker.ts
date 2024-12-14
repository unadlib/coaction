import { create } from '@coaction/react';
import { logger } from '@coaction/logger';

import { counter, type Counter } from './counter';

export const useStore = create<Counter>(counter, {
  middlewares: [
    logger({
      collapsed: false
    })
  ]
});

globalThis.useStore = useStore;
