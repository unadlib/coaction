import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { create as createWithZustand } from 'zustand';
import { bindZustand, adapt } from '@coaction/zustand';

import { counter, type Counter } from './counter';

export const useStore = create<Counter>(
  () => adapt(createWithZustand(bindZustand(counter))),
  {
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);

globalThis.useStore = useStore;
