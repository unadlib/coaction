import { create } from 'coaction';
import { bindYjs, Doc } from '@coaction/yjs';

type YjsState = {
  count: number;
  increment: () => void;
};

export const runExample = () => {
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
  const syncedCount = doc.getMap<any>('counter').get('state').count as number;

  const result = {
    count: store.getState().count,
    syncedCount
  };

  binding.destroy();
  store.destroy();

  return result;
};
