import { create } from 'coaction';
import { bindPinia } from '@coaction/pinia';
import { defineStore } from 'pinia';

export const useStore = create({
  counter: (set) =>
    defineStore(
      'counter',
      bindPinia({
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
            set(() => {
              // @ts-ignore
              this.count++;
            });

            set(() => {
              // @ts-ignore
              this.count++;
            });
          }
        }
      })
    )
});

// @ts-ignore
globalThis.useStore = useStore;
