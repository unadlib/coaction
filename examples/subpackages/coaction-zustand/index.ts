import { create } from 'coaction';
import { create as createWithZustand } from 'zustand';
import { adapt, bindZustand } from '@coaction/zustand';

type ZustandState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const zustandStore = createWithZustand(
    bindZustand<ZustandState>((set) => ({
      count: 0,
      increment() {
        set((state) => ({
          count: state.count + 1
        }));
      }
    }))
  );

  const store = create(() => adapt(zustandStore), {
    name: 'zustand-example'
  });

  store.getState().increment();
  const result = {
    count: store.getState().count
  };
  store.destroy();

  return result;
};
