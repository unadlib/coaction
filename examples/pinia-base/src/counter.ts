import { bindPinia, adapt, defineStore } from '@coaction/pinia';

export type Counter = {
  count: number;
  readonly double: number;
  increment: () => void;
};

export const counter = () =>
  adapt<Counter>(
    defineStore(
      'test',
      bindPinia({
        state: () => ({ count: 0 }),
        getters: {
          double: (state) => {
            return state.count * 2;
          }
        },
        actions: {
          increment() {
            this.count += 1;
          }
        }
      })
    )
  );
