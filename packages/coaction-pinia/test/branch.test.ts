import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  let capturedHandleState: any;
  vi.doMock('coaction', () => ({
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
    }
  }));
  await import('../src');
  return {
    capturedHandleStore,
    capturedHandleState
  };
};

afterEach(() => {
  vi.doUnmock('coaction');
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
  expect(rawState.name).toBe('counter');
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
    destroy: baseDestroy
  };
  const internal = {};

  capturedHandleStore(store as any, rawState1, rawState1, internal as any);
  capturedHandleStore(store as any, rawState2, rawState2, internal as any);

  const listener = vi.fn();
  const unsubscribe = (store as any).subscribe(listener);
  watcher1?.('first');
  watcher2?.('second');
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  watcher1?.('after-unsubscribe');
  expect(listener).toHaveBeenCalledTimes(2);

  (store as any).apply(rootState);
  expect(rootState.count).toBe(0);

  (store as any).apply({
    count: 3
  });
  expect(rootState.count).toBe(3);

  (store as any).apply(rootState, [
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
});
