import { create, Slices } from 'coaction';

type Counter = {
  count: number;
  increment: () => void;
};

const counter: Slices<
  {
    counter: Counter;
  },
  'counter'
> = (set, get, api) => ({
  name: 'test',
  count: 0,
  increment() {
    set((draft) => {
      draft.counter.count += 1;
      // console.log(
      //   'count',
      //   this.count,
      //   draft.counter.count,
      //   get().counter.count,
      //   api.getState().counter.count
      // );
    });
  }
});

export const useStore = create({
  counter
});

// @ts-ignore
globalThis.useStore = useStore;
