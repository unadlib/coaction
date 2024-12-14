import type { Slices } from 'coaction';

export type Counter = Slices<
  {
    counter: {
      count: number;
      increment: () => void;
    };
  },
  'counter'
>;

export const counter: Counter = (set) => ({
  count: 0,
  increment() {
    set((draft) => {
      draft.counter.count += 1;
    });
  }
});
