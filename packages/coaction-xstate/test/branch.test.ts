import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  let capturedHandleState: any;
  const replaceExternalStoreState = vi.fn();
  const cancelReadySubscription = vi.fn();
  vi.doMock('coaction/adapter', () => ({
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
    onStoreReady: vi.fn((_store: unknown, callback: () => void) => {
      callback();
      return cancelReadySubscription;
    }),
    replaceExternalStoreState
  }));
  await import('../src');
  return {
    capturedHandleStore,
    capturedHandleState,
    cancelReadySubscription,
    replaceExternalStoreState
  };
};

afterEach(() => {
  vi.doUnmock('coaction/adapter');
  vi.resetModules();
});

test('throws when actor is not registered in actorMap', async () => {
  const { capturedHandleStore } = await loadBinding();
  expect(() => {
    capturedHandleStore(
      {
        setState: vi.fn(),
        destroy: vi.fn()
      },
      {},
      {},
      {}
    );
  }).toThrow('xstate actor is not found');
});

test('supports actor-driven updates and unsubscribes on destroy', async () => {
  const {
    capturedHandleStore,
    capturedHandleState,
    cancelReadySubscription,
    replaceExternalStoreState
  } = await loadBinding();
  const unsubscribe = vi.fn();
  let observer: ((snapshot: { context: { count: number } }) => void) | null =
    null;
  const actor = {
    getSnapshot: () => ({
      context: {
        count: 0
      }
    }),
    subscribe: vi.fn(
      (next: (snapshot: { context: { count: number } }) => void) => {
        observer = next;
        return {
          unsubscribe
        };
      }
    ),
    send: vi.fn()
  };
  const { copyState, bind } = capturedHandleState(actor);
  const rawState = bind(copyState);
  const baseDestroy = vi.fn();
  const internal = {};
  const store: any = {
    setState: vi.fn(),
    apply: vi.fn(),
    destroy: baseDestroy
  };
  capturedHandleStore(store as any, rawState, copyState, internal);
  observer!({
    context: {
      count: 1
    }
  });
  expect(replaceExternalStoreState).toHaveBeenCalledWith(store, internal, {
    count: 1
  });
  expect(() =>
    store.setState({
      count: 2
    })
  ).toThrow(
    'XState binding state cannot be mutated directly. Please use actor events.'
  );
  // The refusal lives on `assertMutationAllowed`, which core calls from
  // `apply`. This store is a stub whose `apply` is a spy, so it is asked
  // directly -- the end-to-end refusal through a real store is asserted by the
  // commit conformance suite.
  expect(() => (internal as any).assertMutationAllowed('apply')).toThrow(
    'XState binding state cannot be mutated directly. Please use actor events.'
  );
  store.destroy();
  expect(cancelReadySubscription).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});

test('destroy unsubscribes actor only once', async () => {
  const { capturedHandleStore, capturedHandleState, cancelReadySubscription } =
    await loadBinding();
  const unsubscribe = vi.fn(() => {
    if (unsubscribe.mock.calls.length > 1) {
      throw new Error('unsubscribe called twice');
    }
  });
  const actor = {
    getSnapshot: () => ({
      context: {
        count: 0
      }
    }),
    subscribe: vi.fn(() => ({
      unsubscribe
    })),
    send: vi.fn()
  };
  const { copyState, bind } = capturedHandleState(actor);
  const rawState = bind(copyState);
  const baseDestroy = vi.fn();
  const store: any = {
    setState: vi.fn(),
    apply: vi.fn(),
    destroy: baseDestroy
  };

  capturedHandleStore(store as any, rawState, copyState, {});

  store.destroy();
  expect(() => store.destroy()).not.toThrow();
  expect(cancelReadySubscription).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});
