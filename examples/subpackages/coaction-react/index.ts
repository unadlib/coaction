import { create } from '@coaction/react';

type ReactState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<ReactState>((set) => ({
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
