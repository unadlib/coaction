import { create } from '@coaction/svelte';

type SvelteState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const store = create<SvelteState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const selectedValues: number[] = [];
  const selectedCount = store((state) => state.count);
  const unsubscribe = selectedCount.subscribe((value) => {
    selectedValues.push(value);
  });

  store.getState().increment();
  unsubscribe();

  const result = {
    count: store().count,
    selectedValues
  };
  store.destroy();

  return result;
};
