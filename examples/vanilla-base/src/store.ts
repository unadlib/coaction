import { create } from 'coaction';

export const useStore = create((set) => ({
  name: 'test',
  count: 0,
  increment() {
    set((draft) => {
      draft.count += 1;
    });
  }
}));
// @ts-ignore
globalThis.WorkerGlobalScope && console.log('store', globalThis.name ?? 'main');
