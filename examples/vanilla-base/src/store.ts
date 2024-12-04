import { create, Slices } from 'coaction';
import { logger } from '@coaction/logger';
import { createTransport } from 'data-transport';
type Counter = Slices<
  {
    counter: {
      count: number;
      increment: () => void;
    };
  },
  'counter'
>;

const counter: Counter = (set, get, store) => ({
  name: 'test',
  count: 0,
  increment() {
    set((draft) => {
      draft.counter.count += 1;
    });
  }
});

export const useStore = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    name: 'test',
    // @ts-ignore
    transport: globalThis.SharedWorkerGlobalScope
      ? createTransport('SharedWorkerInternal', {
          verbose: true,
          prefix: 'test'
        })
      : undefined,
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);
