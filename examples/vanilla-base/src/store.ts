import logger from '@coaction/logger';
import { create, type Slices, AsyncStore, SliceState } from 'coaction';

export type Counter = Slices<
  {
    counter: {
      count: number;
      increment: () => void;
    };
  },
  'counter'
>;

const worker = globalThis.SharedWorker
  ? new SharedWorker(new URL('./store.ts', import.meta.url), {
      type: 'module'
    })
  : undefined;

const store = create<{
  counter: Counter;
}>(
  {
    counter: (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.counter.count += 1;
        });
      }
    })
  },
  {
    ...(worker ? { worker } : {}),
    middlewares: [logger({ collapsed: false })]
  }
);

export const useWorkerStore = store as AsyncStore<
  SliceState<{ counter: Counter }>,
  true
>;
