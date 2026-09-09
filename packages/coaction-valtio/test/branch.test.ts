import { proxy } from 'valtio/vanilla';
import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  const replaceExternalStoreState = vi.fn();
  vi.doMock('coaction/adapter', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
      ...actual,
      createBinder: ({ handleStore }: { handleStore: any }) => {
        capturedHandleStore = handleStore;
        return (input: unknown) => input;
      },
      onStoreReady: (_store: unknown, callback: () => void) => {
        callback();
        return () => undefined;
      },
      replaceExternalStoreState,
      sanitizeInitialStateValue: (value: unknown) => value,
      sanitizeReplacementState: (value: unknown) => value
    };
  });
  await import('../src');
  return {
    capturedHandleStore,
    replaceExternalStoreState
  };
};

afterEach(() => {
  vi.doUnmock('coaction/adapter');
  vi.doUnmock('valtio/vanilla');
  vi.resetModules();
});

test('falls back to rawState when no mutable mapping exists', async () => {
  const { capturedHandleStore } = await loadBinding();
  const rawState = proxy({
    count: 0
  });
  const store = {
    getPureState: () => rawState,
    getState: () => ({
      count: rawState.count
    })
  };
  const internal = { notify: (callback: () => void) => callback() };
  capturedHandleStore(store as any, rawState as any, rawState as any, internal);
  const listener = vi.fn();
  const unsubscribe = (store as any).subscribe(listener);
  rawState.count = 1;
  await Promise.resolve();
  unsubscribe();
  expect(listener).toHaveBeenCalledTimes(1);
});

test('skips re-initialization when internal mutable mapper already exists', async () => {
  const { capturedHandleStore } = await loadBinding();
  const firstRawState = proxy({
    count: 0
  });
  const secondRawState = proxy({
    count: 10
  });
  const store = {
    getPureState: () => firstRawState,
    getState: () => ({
      count: firstRawState.count
    })
  };
  const internal = { notify: (callback: () => void) => callback() };
  capturedHandleStore(
    store as any,
    firstRawState as any,
    firstRawState as any,
    internal
  );
  const subscribeRef = (store as any).subscribe;
  capturedHandleStore(
    store as any,
    secondRawState as any,
    secondRawState as any,
    internal
  );
  expect((store as any).subscribe).toBe(subscribeRef);
});

test('destroy unsubscribes valtio listener only once', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  const cancelReadySubscription = vi.fn();
  const unsubscribe = vi.fn(() => {
    if (unsubscribe.mock.calls.length > 1) {
      throw new Error('unsubscribe called twice');
    }
  });
  vi.doMock('coaction/adapter', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
      ...actual,
      createBinder: ({ handleStore }: { handleStore: any }) => {
        capturedHandleStore = handleStore;
        return (input: unknown) => input;
      },
      onStoreReady: vi.fn((_store: unknown, callback: () => void) => {
        callback();
        return cancelReadySubscription;
      }),
      replaceExternalStoreState: vi.fn(),
      sanitizeInitialStateValue: (value: unknown) => value,
      sanitizeReplacementState: (value: unknown) => value
    };
  });
  vi.doMock('valtio/vanilla', () => ({
    proxy: (value: unknown) => value,
    subscribe: vi.fn(() => unsubscribe)
  }));
  await import('../src');
  const state = {
    count: 0
  };
  const baseDestroy = vi.fn();
  const store = {
    share: false,
    getPureState: () => state,
    getState: () => state,
    destroy: baseDestroy
  };

  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    {
      notifyStateChange: vi.fn()
    } as any
  );

  (store as any).destroy();
  expect(() => (store as any).destroy()).not.toThrow();
  expect(cancelReadySubscription).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});

test('adapter snapshots preserve local rich values before JSON validation', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  let listener: (() => void) | undefined;
  const replaceExternalStoreState = vi.fn();
  vi.doMock('coaction/adapter', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
      ...actual,
      createBinder: ({ handleStore }: { handleStore: any }) => {
        capturedHandleStore = handleStore;
        return (input: unknown) => input;
      },
      onStoreReady: vi.fn((_store: unknown, callback: () => void) => {
        callback();
        return vi.fn();
      }),
      replaceExternalStoreState,
      sanitizeInitialStateValue: (value: unknown) => value,
      sanitizeReplacementState: (value: unknown) => value
    };
  });
  vi.doMock('valtio/vanilla', () => ({
    proxy: (value: unknown) => value,
    subscribe: vi.fn((_state: unknown, callback: () => void) => {
      listener = callback;
      return vi.fn();
    })
  }));
  await import('../src');
  const tag = Symbol('array-tag');
  type SparseArray = any[] & Record<PropertyKey, any>;
  const makeList = (label: string, includeUndefined: boolean) => {
    const list = [] as SparseArray;
    list.length = 2;
    if (includeUndefined) {
      list[0] = undefined;
    }
    list[1] = label;
    list.label = label;
    list[tag] = label;
    return list;
  };
  const state = {
    list: makeList('before', false),
    stamp: new Date('2026-01-01T00:00:00.000Z')
  };
  const store = {
    share: 'main',
    getPureState: () => state,
    getState: () => state,
    destroy: vi.fn()
  };

  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    {
      rootState: state
    } as any
  );
  const nextStamp = new Date('2026-01-02T00:00:00.000Z');
  state.list = makeList('after', true);
  state.stamp = nextStamp;
  listener?.();

  const snapshot = replaceExternalStoreState.mock.calls[0][2] as any;
  expect(snapshot.list.length).toBe(2);
  expect(Object.prototype.hasOwnProperty.call(snapshot.list, 0)).toBe(true);
  expect(snapshot.list[0]).toBeUndefined();
  expect(snapshot.list[1]).toBe('after');
  expect(snapshot.list.label).toBe('after');
  expect(snapshot.list[tag]).toBe('after');
  expect(snapshot.stamp).toBe(nextStamp);
});
