import { vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('use-sync-external-store/shim');
  vi.resetModules();
});

test('uses getInitialState as fallback snapshot for selector and multi-selector', async () => {
  vi.resetModules();
  const useSyncExternalStore = vi.fn(
    (
      _subscribe: () => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot?: () => unknown
    ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
  );
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore
  }));

  const { create, createSelector } = await import('../src');
  const useCounter = create(() => ({
    count: 1
  }));
  const useStep = create(() => ({
    step: 2
  }));

  const selected = useCounter((state) => state.count);
  const plain = useCounter();
  const selectTotal = createSelector(useCounter, useStep);
  const total = selectTotal((counter, step) => counter.count + step.step);

  expect(selected).toBe(1);
  expect(plain.count).toBe(1);
  expect(total).toBe(3);
  expect(useSyncExternalStore).toHaveBeenCalledTimes(3);
  expect(typeof useSyncExternalStore.mock.calls[0][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[1][2]).toBe('function');
  expect(typeof useSyncExternalStore.mock.calls[2][2]).toBe('function');
});

test('autoSelector in slices mode ignores non-object slice values', async () => {
  vi.resetModules();
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        _subscribe: () => () => void,
        getSnapshot: () => unknown,
        getServerSnapshot?: () => unknown
      ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
    )
  }));
  const { create } = await import('../src');
  const protoKey = '__coactionReactNonObjectSlice__';
  Object.defineProperty(Object.prototype, protoKey, {
    value: 1,
    enumerable: true,
    configurable: true,
    writable: true
  });
  try {
    const store = create({
      counter: () => ({
        count: 0
      })
    });
    const selectors = store({ autoSelector: true }) as any;
    expect(selectors.counter).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(selectors, protoKey)
    ).toBeFalsy();
  } finally {
    delete (Object.prototype as any)[protoKey];
  }
});

test('handles non-object slice state defensively', async () => {
  vi.resetModules();
  const mockStore = {
    isSliceStore: true,
    subscribe: () => () => undefined,
    getState: () => null,
    getPureState: () => null,
    getInitialState: () => null
  };
  vi.doMock('coaction', () => ({
    create: () => mockStore,
    wrapStore: (store: object, selectorHook: (selector: any) => unknown) =>
      Object.assign((selector?: unknown) => selectorHook(selector), store)
  }));
  vi.doMock('use-sync-external-store/shim', () => ({
    useSyncExternalStore: vi.fn(
      (
        _subscribe: () => () => void,
        getSnapshot: () => unknown,
        getServerSnapshot?: () => unknown
      ) => (getServerSnapshot ? getServerSnapshot() : getSnapshot())
    )
  }));
  const { create } = await import('../src');
  const store = create(() => ({}));
  expect(store({ autoSelector: true })).toMatchInlineSnapshot(`{}`);
});
