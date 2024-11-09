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
    });
  }
});

export const useStore = create({
  counter
});
