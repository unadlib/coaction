import { create } from 'coaction';
import { logger } from '@coaction/logger';

import { counter, type Counter } from './store';

export const useStore = create<Counter>(counter, {
  middlewares: [
    logger({
      collapsed: false
    })
  ]
});

globalThis.useStore = useStore;
