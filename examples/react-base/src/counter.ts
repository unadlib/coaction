import type { Slice } from '@coaction/react';

export type Counter = {
  count: number;
  double: number;
  increment: () => void;
};

export const counter: Slice<Counter> = (set, get) => ({
  count: 0,
  double: get(
    (state) => [state.count],
    (count) => count * 2
  ),
  increment() {
    set(() => {
      this.count += 1;
    });
  }
});
