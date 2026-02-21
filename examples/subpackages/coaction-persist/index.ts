import { create } from 'coaction';
import { createJSONStorage, persist } from '@coaction/persist';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

export const runExample = async () => {
  const map = new Map<string, string>();
  const storage = createJSONStorage(() => ({
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => {
      map.set(name, value);
    },
    removeItem: (name: string) => {
      map.delete(name);
    },
    clear: () => {
      map.clear();
    },
    key: () => null,
    length: 0
  }));

  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        persist({
          name: 'persist-example',
          storage
        })
      ]
    }
  );

  store.getState().increment();
  await nextTick();

  const raw = storage.getItem('persist-example');
  const persistedCount = raw
    ? (JSON.parse(raw) as { state: { count: number } }).state.count
    : null;

  const result = {
    count: store.getState().count,
    persistedCount
  };
  store.destroy();

  return result;
};
