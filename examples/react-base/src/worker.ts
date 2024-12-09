import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { counter, Counter } from './store';

export const useStore = create<{
  counter: Counter;
}>(
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
