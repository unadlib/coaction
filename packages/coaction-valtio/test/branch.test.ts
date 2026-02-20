import { proxy } from 'valtio/vanilla';
import { vi } from 'vitest';

const loadBinding = async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    }
  }));
  await import('../src');
  return {
    capturedHandleStore
  };
};

afterEach(() => {
  vi.doUnmock('coaction');
  vi.resetModules();
});

test('falls back to rawState when no mutable mapping exists', async () => {
  const { capturedHandleStore } = await loadBinding();
  const rawState = proxy({
    count: 0
  });
  const store = {
    getState: () => ({
      count: rawState.count
    })
  };
  const internal = {};
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
    getState: () => ({
      count: firstRawState.count
    })
  };
  const internal = {};
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
