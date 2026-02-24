import { create } from 'coaction';
import { vi } from 'vitest';
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

test('calls onRehydrateStorage for empty storage and deserialize errors', async () => {
  const emptyStorage = createMemoryStorage();
  const emptyCallback = jest.fn();
  const emptyStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'empty',
          storage: emptyStorage,
          onRehydrateStorage: emptyCallback
        })
      ]
    }
  );
  await nextTick();
  expect(emptyStore.getState().count).toBe(0);
  expect((emptyStore as any).persist.hasHydrated()).toBeTruthy();
  expect(emptyCallback).toHaveBeenCalledWith(
    expect.objectContaining({
      count: 0
    })
  );

  const invalidStorage = createMemoryStorage();
  invalidStorage.setItem('invalid', '{bad-json');
  const errorCallback = jest.fn();
  const invalidStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'invalid',
          storage: invalidStorage,
          onRehydrateStorage: errorCallback
        })
      ]
    }
  );
  await nextTick();
  expect((invalidStore as any).persist.hasHydrated()).toBeTruthy();
  expect(errorCallback).toHaveBeenCalledWith(
    undefined,
    expect.any(SyntaxError)
  );
});

test('manual rehydrate marks hydration as completed even when it fails', async () => {
  const invalidStorage = createMemoryStorage();
  invalidStorage.setItem('invalid-manual', '{bad-json');
  const useStore = create(
    () => ({
      count: 0
    }),
    {
      middlewares: [
        persist({
          name: 'invalid-manual',
          storage: invalidStorage,
          skipHydration: true
        })
      ]
    }
  );
  expect((useStore as any).persist.hasHydrated()).toBeFalsy();
  await (useStore as any).persist.rehydrate();
  expect((useStore as any).persist.hasHydrated()).toBeTruthy();
});

test('supports noop storage fallback when storage is nullish', async () => {
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
          name: 'noop',
          storage: null as unknown as PersistStorage
        })
      ]
    }
  );
  useStore.getState().increment();
  await nextTick();
  await (useStore as any).persist.clearStorage();
  useStore.destroy();
  expect(useStore.getState().count).toBe(1);
});

test('uses default storage when localStorage is unavailable', async () => {
  vi.stubGlobal('localStorage', undefined);
  expect(typeof localStorage).toBe('undefined');
  try {
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
            name: 'default-storage',
            skipHydration: true
          })
        ]
      }
    );
    useStore.getState().increment();
    await nextTick();
    await (useStore as any).persist.clearStorage();
    useStore.destroy();
    expect(useStore.getState().count).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('uses default localStorage when available', async () => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => map.get(name) ?? null,
    setItem: (name: string, value: string) => {
      map.set(name, value);
    },
    removeItem: (name: string) => {
      map.delete(name);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    }
  } as Storage);
  try {
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
            name: 'browser-storage',
            skipHydration: true
          })
        ]
      }
    );
    useStore.getState().increment();
    await nextTick();
    expect(map.get('browser-storage')).toContain('"count":1');
    await (useStore as any).persist.clearStorage();
    expect(map.has('browser-storage')).toBeFalsy();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('falls back when queueMicrotask is unavailable', async () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  (globalThis as any).queueMicrotask = undefined;
  try {
    const storage = createMemoryStorage();
    storage.setItem(
      'counter-fallback',
      JSON.stringify({
        state: {
          count: 9
        },
        version: 0
      })
    );
    const useStore = create(
      () => ({
        count: 0
      }),
      {
        middlewares: [
          persist({
            name: 'counter-fallback',
            storage
          })
        ]
      }
    );
    await nextTick();
    expect(useStore.getState().count).toBe(9);
    expect((useStore as any).persist.hasHydrated()).toBeTruthy();
  } finally {
    (globalThis as any).queueMicrotask = originalQueueMicrotask;
  }
});
