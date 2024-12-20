import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { create as createWithZustand } from 'zustand';
import { bindZustand } from '@coaction/zustand';

import { counter, type Counter } from './counter';

export const useStore = create<Counter>(
  () => createWithZustand(bindZustand(counter)),
  {
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);

globalThis.useStore = useStore;
