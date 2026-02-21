import { create } from 'coaction';
import { adapt, atom, bindJotai, createStore } from '@coaction/jotai';

type JotaiState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
  const countAtom = atom(0);
  const jotaiStore = createStore();
  const store = create<JotaiState>(
    () =>
      adapt(
        bindJotai({
          store: jotaiStore,
          atoms: {
            count: countAtom
          },
          actions: ({ store: atomStore, atoms }) => ({
            increment() {
              atomStore.set(atoms.count, atomStore.get(atoms.count) + 1);
            }
          })
        })
      ),
    {
      name: 'jotai-example'
    }
  );

  store.getState().increment();
  const result = {
    count: store.getState().count,
    atomCount: jotaiStore.get(countAtom)
  };
  store.destroy();

  return result;
};
