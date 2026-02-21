import { create } from 'coaction';

type CounterState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<CounterState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const before = store.getState().count;
  store.getState().increment();
  const after = store.getState().count;
  store.destroy();

  return {
    before,
    after
  };
};
