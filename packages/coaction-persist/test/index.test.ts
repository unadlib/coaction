import { create } from 'coaction';
import { createJSONStorage, persist, PersistStorage } from '../src';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createMemoryStorage = (): PersistStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

test('persist and rehydrate', async () => {
  const storage = createMemoryStorage();
  const useStore = create(
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
          name: 'counter',
          storage
        })
      ]
    }
  );
  useStore.getState().increment();
  await nextTick();
  const cached = storage.getItem('counter')!;
  expect(cached).toContain('"count":1');
  const rehydratedStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage
        })
      ]
    }
  );
  await nextTick();
  expect(rehydratedStore.getState().count).toBe(1);
});

test('supports version migration', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'counter',
    JSON.stringify({
      state: {
        count: 2
      },
      version: 0
    })
  );
  const useStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage,
          version: 1,
          migrate: (persistedState) => ({
            ...persistedState,
            count: (persistedState as any).count + 3
          })
        })
      ]
    }
  );
  await nextTick();
  expect(useStore.getState().count).toBe(5);
});

test('supports skipHydration and manual rehydrate', async () => {
  const storage = createMemoryStorage();
  storage.setItem(
    'counter',
    JSON.stringify({
      state: {
        count: 8
      },
      version: 0
    })
  );
  const useStore = create(
    (set) => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'counter',
          storage,
          skipHydration: true
        })
      ]
    }
  );
  expect(useStore.getState().count).toBe(0);
  expect((useStore as any).persist.hasHydrated()).toBeFalsy();
  await (useStore as any).persist.rehydrate();
  expect(useStore.getState().count).toBe(8);
  expect((useStore as any).persist.hasHydrated()).toBeTruthy();
  await (useStore as any).persist.clearStorage();
  expect(storage.getItem('counter')).toBeNull();
});

test('createJSONStorage', () => {
  const map = new Map<string, string>();
  const storage = createJSONStorage(() => ({
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
    clear: () => map.clear(),
    key: () => null,
    length: 0
  }));
  storage.setItem('name', 'value');
  expect(storage.getItem('name')).toBe('value');
  storage.removeItem('name');
  expect(storage.getItem('name')).toBeNull();
});
