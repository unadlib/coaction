import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  let capturedHandleState: any;
  const replaceExternalStoreState = vi.fn();
  vi.doMock('coaction/adapter', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
      ...actual,
      createBinder: ({
        handleStore,
        handleState
      }: {
        handleStore: any;
        handleState: any;
      }) => {
        capturedHandleStore = handleStore;
        capturedHandleState = handleState;
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
    capturedHandleState,
    replaceExternalStoreState
  };
};

afterEach(() => {
  vi.doUnmock('coaction/adapter');
  vi.resetModules();
});

test('creates empty getters map when getters are omitted', async () => {
  const { capturedHandleState } = await loadBinding();
  const options: any = {
    state: () => ({
      count: 0
    }),
    actions: {}
  };
  const { bind } = capturedHandleState(options);
  const rawState = bind({
    $id: 'counter',
    $subscribe: vi.fn(() => vi.fn())
  });
  expect(options.getters).toEqual({});
  expect(rawState.name).toBeUndefined();
});

test('builds descriptors from own function getters only', async () => {
  const { capturedHandleState } = await loadBinding();
  const proto = {
    inherited: () => 'inherited'
  };
  const getters = Object.create(proto) as {
    own: (state: { count: number }) => number;
    invalid: number;
  };
  getters.own = (state) => state.count * 2;
  getters.invalid = 1;
  const options: any = {
    state: () => ({
      count: 2
    }),
    getters,
    actions: {}
  };
  const { bind } = capturedHandleState(options);
  const rawState = bind({
    $id: 'counter',
    $subscribe: vi.fn(() => vi.fn())
  });

  expect(rawState.own).toBe(4);
  expect(rawState.inherited).toBeUndefined();
  expect(rawState.invalid).toBeUndefined();
});

test('throws when pinia store instance cannot be resolved', async () => {
  const { capturedHandleStore } = await loadBinding();
  expect(() => {
    capturedHandleStore(
      {
        destroy: vi.fn(),
        getState: () => ({})
      },
      {},
      {},
      {}
    );
  }).toThrow('Pinia store instance is not found');
});

test('reuses internals, supports apply branches and cleans up subscriptions', async () => {
  const { capturedHandleStore, capturedHandleState } = await loadBinding();
  const baseOptions: any = {
    state: () => ({
      count: 0
    }),
    getters: {
      double: (state: { count: number }) => state.count * 2
    },
    actions: {}
  };
  const firstStateBinding = capturedHandleState(baseOptions);
  const secondStateBinding = capturedHandleState(baseOptions);

  let watcher1: ((...args: unknown[]) => void) | undefined;
  let watcher2: ((...args: unknown[]) => void) | undefined;
  const stopWatch1 = vi.fn();
  const stopWatch2 = vi.fn();
  const rawState1 = firstStateBinding.bind({
    $id: 'counter-1',
    $subscribe: vi.fn((callback: (...args: unknown[]) => void) => {
      watcher1 = callback;
      return stopWatch1;
    })
  });
  const rawState2 = secondStateBinding.bind({
    $id: 'counter-2',
    $subscribe: vi.fn((callback: (...args: unknown[]) => void) => {
      watcher2 = callback;
      return stopWatch2;
    })
  });

  const rootState = {
    count: 0
  };
  const baseDestroy = vi.fn();
  const store = {
    getState: () => rootState,
    getPureState: () => rootState,
    destroy: baseDestroy
  };
  const internal = {};

  capturedHandleStore(store as any, rawState1, rawState1, internal as any);
  capturedHandleStore(store as any, rawState2, rawState2, internal as any);

  const listener = vi.fn();
  const unsubscribe = (store as any).subscribe(listener);
  const unsubscribeAfterDestroy = (store as any).subscribe(vi.fn());
  watcher1?.('first');
  watcher2?.('second');
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  watcher1?.('after-unsubscribe');
  expect(listener).toHaveBeenCalledTimes(2);

  // The write into Pinia's own runtime, which is all the adapter installs now.
  // `store.apply` belongs to core and reaches this through
  // `internal.externalApply`; this store is a stub, so the writer is called
  // directly.
  (internal as any).externalApply(rootState);
  expect(rootState.count).toBe(0);

  (internal as any).externalApply({
    count: 3
  });
  expect(rootState.count).toBe(3);

  (internal as any).externalApply(rootState, [
    {
      op: 'replace',
      path: ['count'],
      value: 9
    }
  ]);
  expect(rootState.count).toBe(9);

  (store as any).destroy();
  expect(baseDestroy).toHaveBeenCalledTimes(1);
  expect(stopWatch1).toHaveBeenCalledTimes(1);
  expect(stopWatch2).toHaveBeenCalledTimes(1);
  expect((store as any)._subscriptions).toBeUndefined();
  expect((store as any)._destroyers).toBeUndefined();
  expect(() => unsubscribeAfterDestroy()).not.toThrow();
  expect(() => (store as any).destroy()).not.toThrow();
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});

test('destroy cleans pinia subscriptions before base destroy errors', async () => {
  const { capturedHandleStore, capturedHandleState } = await loadBinding();
  const options: any = {
    state: () => ({
      count: 0
    }),
    actions: {}
  };
  const stopWatch = vi.fn();
  const { bind } = capturedHandleState(options);
  const rawState = bind({
    $id: 'destroy-error',
    $subscribe: vi.fn(() => stopWatch)
  });
  const destroyError = new Error('base destroy failed');
  const baseDestroy = vi.fn(() => {
    throw destroyError;
  });
  const store = {
    getState: () => rawState,
    getPureState: () => rawState,
    destroy: baseDestroy
  };

  capturedHandleStore(store as any, rawState, rawState, {} as any);
  const unsubscribe = (store as any).subscribe(vi.fn());

  expect(() => {
    (store as any).destroy();
  }).toThrow(destroyError);
  expect(stopWatch).toHaveBeenCalledTimes(1);
  expect((store as any)._subscriptions).toBeUndefined();
  expect((store as any)._destroyers).toBeUndefined();
  expect(() => unsubscribe()).not.toThrow();
  expect(() => (store as any).destroy()).not.toThrow();
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});

test('adapter snapshots preserve local rich values before JSON validation', async () => {
  const {
    capturedHandleStore,
    capturedHandleState,
    replaceExternalStoreState
  } = await loadBinding();
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
  let watcher: (() => void) | undefined;
  const options: any = {
    state: () => ({
      list: makeList('before', false),
      stamp: new Date('2026-01-01T00:00:00.000Z')
    }),
    actions: {}
  };
  const { bind } = capturedHandleState(options);
  const rawState = bind({
    $id: 'sparse-array',
    $subscribe: vi.fn((callback: () => void) => {
      watcher = callback;
      return vi.fn();
    })
  });
  const store = {
    share: 'main',
    getPureState: () => rawState,
    getState: () => rawState,
    destroy: vi.fn()
  };

  capturedHandleStore(store as any, rawState, rawState, {
    rootState: rawState
  } as any);
  const nextStamp = new Date('2026-01-02T00:00:00.000Z');
  rawState.list = makeList('after', true);
  rawState.stamp = nextStamp;
  watcher?.();

  const snapshot = replaceExternalStoreState.mock.calls[0][2] as any;
  expect(snapshot.list.length).toBe(2);
  expect(Object.prototype.hasOwnProperty.call(snapshot.list, 0)).toBe(true);
  expect(snapshot.list[0]).toBeUndefined();
  expect(snapshot.list[1]).toBe('after');
  expect(snapshot.list.label).toBe('after');
  expect(snapshot.list[tag]).toBe('after');
  expect(snapshot.stamp).toBe(nextStamp);
});
