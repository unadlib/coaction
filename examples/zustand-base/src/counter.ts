import type { StateCreator } from 'zustand';

export type Counter = {
  count: number;
  increment: () => void;
};

export const counter: StateCreator<
  {
    count: number;
    increment: () => void;
  },
  [],
  []
> = (set) => ({
  count: 0,
  increment() {
    set((state) => ({ count: state.count + 1 }));
  }
});
