import { effectScope } from 'vue';
import { create } from '@coaction/vue';

type VueState = {
  count: number;
  readonly double: number;
  increment: () => void;
};

export const runExample = () => {
  const useStore = create<VueState>((set) => ({
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

  let result: {
    count: number;
    double: number;
  } | null = null;

  const scope = effectScope();
  scope.run(() => {
    const state = useStore();
    const count = useStore((current) => current.count);
    const double = useStore((current) => current.double);
    state.increment();
    result = {
      count: count.value,
      double: double.value
    };
  });
  scope.stop();
  useStore.destroy();

  return result;
};
