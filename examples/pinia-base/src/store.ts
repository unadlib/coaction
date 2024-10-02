import { defineStore } from 'pinia';
import { createWithPinia } from '@coaction/pinia';

export const useStore = createWithPinia(() =>
  defineStore('counter', {
    state: () => ({
      count: 0
    }),
    getters: {
      doubleCount: (state) => state.count * 2
    },
    actions: {
      // since we rely on `this`, we cannot use an arrow function
      increment() {
        this.count++;
      }
    }
  })
);

globalThis.useStore = useStore;
