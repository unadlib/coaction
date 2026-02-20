import { vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('coaction');
  vi.resetModules();
});

test('skips handleStore re-initialization when mutable mapper already exists', async () => {
  vi.resetModules();
  let capturedHandleStore: any;
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    }
  }));
  await import('../src');
  const internal = {};
  const state = {
    count: 0
  };
  const store = {
    getState: () => state
  };
  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    internal as any
  );
  const applyRef = (store as any).apply;
  capturedHandleStore(
    store as any,
    state as any,
    state as any,
    internal as any
  );
  expect((store as any).apply).toBe(applyRef);
});
