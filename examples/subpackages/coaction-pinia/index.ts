import { create } from 'coaction';
import {
  adapt,
  bindPinia,
  createPinia,
  defineStore,
  setActivePinia
} from '@coaction/pinia';

type PiniaState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  setActivePinia(createPinia());
  const id = 'pinia-example-' + Math.random().toString(16).slice(2);

  const useCounterStore = defineStore(
    id,
    bindPinia({
      state: () => ({
        count: 0
      }),
      actions: {
        increment() {
          this.count += 1;
        }
      }
    })
  );

  const store = create<PiniaState>(() => adapt<PiniaState>(useCounterStore), {
    name: id
  });

  store.getState().increment();
  const result = {
    count: store.getState().count
  };
  store.destroy();

  return result;
};
