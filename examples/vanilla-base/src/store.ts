import { create, Slice } from '../../../packages/core/src/index';

type Counter = {
  count: number;
  increment: () => void;
};

const counter: Slice<
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
      console.log(
        'count',
        draft.counter.count,
        get().counter.count,
        api.getState().counter.count
      );
    });
  }
});

export const useStore = create({
  counter
});

globalThis.useStore = useStore;
