import { create } from '@coaction/alien-signals';

type AlienState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<AlienState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const selectedCount = store((state) => state.count);
  store().increment();
  const result = {
    count: store().count,
    selectedCount: selectedCount()
  };
  store.destroy();

  return result;
};
