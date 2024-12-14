import { create } from 'coaction';
import { logger } from '@coaction/logger';

import { counter, type Counter } from './store';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useWorkerStore = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    worker,
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);

export function setupCounter(element: HTMLButtonElement) {
  useWorkerStore.subscribe(() => {
    element.innerHTML = `count is ${useWorkerStore.getState().counter.count}`;
  });
  element.addEventListener('click', () =>
    useWorkerStore.getState().counter.increment()
  );
  element.innerHTML = `count is ${useWorkerStore.getState().counter.count}`;
}
