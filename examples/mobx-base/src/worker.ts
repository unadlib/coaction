import { create } from 'coaction';
import { logger } from '@coaction/logger';

import { counter } from './store';

export const useStore = create(
  {
    counter
  },
  {
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);

globalThis.useStore = useStore;
