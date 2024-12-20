import type { Slice } from '@coaction/react';

export type Counter = {
  count: number;
  increment: () => void;
};

export const counter: Slice<Counter> = (set) => ({
  count: 0,
  increment() {
    set((state) => ({ count: state.count + 1 }));
  }
});
