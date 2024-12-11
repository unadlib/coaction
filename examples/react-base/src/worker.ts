import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { counter, type Counter } from './counter';

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
