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
  const { capturedHandleStore, capturedHandleState } = await loadBinding();
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
  let hasReentered = false;
  const baseSetState = vi.fn((_next: { count: number }) => {
    if (!hasReentered) {
      hasReentered = true;
      store.setState({
        count: 2
      });
    }
  });
  const baseDestroy = vi.fn();
  const store: any = {
    setState: baseSetState,
    destroy: baseDestroy
  };
  capturedHandleStore(store as any, rawState, copyState, {});
  observer!({
    context: {
      count: 1
    }
  });
  expect(baseSetState).toHaveBeenCalledTimes(2);
  store.destroy();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(baseDestroy).toHaveBeenCalledTimes(1);
});
