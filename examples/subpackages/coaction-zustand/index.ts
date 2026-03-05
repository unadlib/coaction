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
  const afterCoactionIncrement = store.getState().count;

  zustandStore.setState({
    count: 7
  });
  const afterZustandWrite = store.getState().count;

  store.setState({
    count: 10
  });

  const result = {
    afterCoactionIncrement,
    afterZustandWrite,
    finalCoactionCount: store.getState().count,
    finalZustandCount: zustandStore.getState().count
  };
  store.destroy();

  return result;
};
