import { create } from 'coaction';

export const useStore = create({
  name: 'ccc',
  counter: (set, get, api) => ({
    name: 'test',
    count: 0,
    increment() {
      set((draft) => {
        draft.counter.count += 1;
        console.log(
          'count',
          draft.counter.count,
          get().counter.count,
          api.getState().counter.count
        );
      });
    }
  })
});

globalThis.useStore = useStore;
