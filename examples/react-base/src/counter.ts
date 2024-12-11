import type { Slices } from '@coaction/react';

export type Counter = Slices<
  {
    counter: {
      count: number;
      double: number;
      increment: () => void;
    };
  },
  'counter'
>;

export const counter: Counter = (set, get) => ({
  count: 0,
  double: get(
    (state) => {
      console.log('get double0', state.counter.count);
      return [state.counter.count];
    },
    (count) => {
      console.log('get double1', count);
      return count * 2;
    }
  ),
  increment() {
    set((draft) => {
      draft.counter.count += 1;
    });
  }
});
