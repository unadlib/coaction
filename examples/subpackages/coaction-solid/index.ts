import { create } from '@coaction/solid';

type SolidState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const useStore = create<SolidState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const state = useStore();
  const before = state().count;
  useStore.getState().increment();
  const after = state().count;

  useStore.destroy();
  return {
    before,
    after
  };
};
