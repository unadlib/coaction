import { create } from '@coaction/ng';

type NgState = {
  count: number;
  readonly double: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<NgState>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const count = store.select((state) => state.count);
  store.getState().increment();

  const result = {
    count: count(),
    double: store.select((state) => state.double)()
  };
  store.destroy();

  return result;
};
