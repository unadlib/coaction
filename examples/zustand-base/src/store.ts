import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { create as createWithZustand } from 'zustand';
import { bindZustand, adapt } from '@coaction/zustand';

import { counter, type Counter } from './counter';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useStore = create<Counter>(
  () => adapt(createWithZustand(bindZustand(counter))),
  {
    worker,
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);
