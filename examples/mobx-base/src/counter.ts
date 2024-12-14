import { create } from 'coaction';
import { logger } from '@coaction/logger';

import { type Counter, counter } from './store';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

export const useStore = create<{ counter: Counter }>(
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
  useStore.subscribe(() => {
    element.innerHTML = `count is ${useStore.getState().counter.count}`;
  });
  element.addEventListener('click', () =>
    useStore.getState().counter.increment()
  );
  element.innerHTML = `count is ${useStore.getState().counter.count}`;
}
