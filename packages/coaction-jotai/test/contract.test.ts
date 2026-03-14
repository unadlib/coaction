import { expectTypeOf } from 'vitest';
import { atom, createStore } from '../src';
import { runBinderAdapterContract } from '../../core/test/binderAdapterContract';
import { adapt, bindJotai } from '../src';

type Counter = {
  count: number;
  increment: () => void;
};

const createCounterStore = () => {
  const store = createStore();
  const count = atom(0);
  const atoms = {
    count
  };
  const state = adapt(
    bindJotai({
      store,
      atoms,
      actions: ({ store, atoms }) => ({
        increment() {
          store.set(atoms.count, store.get(atoms.count) + 1);
        }
      })
    })
  );
  return {
    store,
    atoms,
    state
  };
};

runBinderAdapterContract({
  packageName: '@coaction/jotai',
  createLocalContract: () => {
    const { store, atoms, state } = createCounterStore();
    return {
      createState: () => state,
      readValue: (useStore) => useStore.getState().count,
      invokeUpdate: (useStore) => useStore.getState().increment(),
      expectedValueAfterUpdate: 1,
      writeExternal: () => {
        store.set(atoms.count, 7);
      },
      expectedValueAfterExternalWrite: 7
    };
  }
});

test('type expectations', () => {
  const { state } = createCounterStore();
  expectTypeOf(state).toMatchTypeOf<Counter>();
});
