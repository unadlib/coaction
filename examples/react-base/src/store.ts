import { create } from '@coaction/react';
import { createTransport } from 'data-transport';

import { counter, type Counter } from './counter';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useStore = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    clientTransport: createTransport('SharedWorkerClient', {
      worker
    }),
    workerType: 'SharedWorkerClient'
  }
);

globalThis.useStore = useStore;
