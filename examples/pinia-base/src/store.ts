import { createWithPinia, defineStore } from '@coaction/pinia';

export const useStore = createWithPinia(() =>
  defineStore('counter', {
    state: () => ({
      count: 0
    }),
    getters: {
      // @ts-ignore
      doubleCount: (state) => state.count * 2
    },
    actions: {
      // since we rely on `this`, we cannot use an arrow function
      increment() {
        // @ts-ignore
        this.count++;
      }
    }
  })
);

// @ts-ignore
globalThis.useStore = useStore;