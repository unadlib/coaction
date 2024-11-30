import { create, logger, Slices } from 'coaction';

type Counter = Slices<
  {
    counter: {
      count: number;
      increment: () => void;
    };
  },
  'counter'
>;

const counter: Counter = (set, get, store) => ({
  name: 'test',
  count: 0,
  increment() {
    set((draft) => {
      draft.counter.count += 1;
    });
  }
});

export const useStore = create(
  {
    counter
  },
  {
    middlewares: [logger()]
  }
);
