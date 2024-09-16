import { create } from 'coaction';

export const useStore = create({
  counter: (set) => ({
    name: 'test',
    count: 0,
    increment() {
      set((draft) => {
        draft.counter.count += 1;
      });
    }
  })
});

globalThis.useStore = useStore;

// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
