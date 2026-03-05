import { create } from 'coaction';
import { bindYjs, Doc } from '@coaction/yjs';

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type YjsState = {
  count: number;
  increment: () => void;
};

export const runExample = async () => {
  const doc = new Doc();
  const store = create<YjsState>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const binding = bindYjs(store, {
    doc,
    key: 'counter'
  });

  store.getState().increment();
  const countAfterLocalIncrement = store.getState().count;

  const syncedState = doc.getMap<any>('counter').get('state');
  const syncedCountFromLocalIncrement =
    syncedState && typeof syncedState.get === 'function'
      ? (syncedState.get('count') as number)
      : undefined;

  doc.transact(() => {
    if (syncedState && typeof syncedState.set === 'function') {
      syncedState.set('count', 6);
    }
  }, 'external');

  const start = Date.now();
  while (store.getState().count !== 6 && Date.now() - start < 300) {
    await wait(5);
  }

  const result = {
    countAfterLocalIncrement,
    syncedCountFromLocalIncrement,
    countAfterRemoteWrite: store.getState().count
  };

  binding.destroy();
  store.destroy();

  return result;
};
