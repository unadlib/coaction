import { vi } from 'vitest';

test('skips subscription when zustand state is already synced', async () => {
  vi.resetModules();

  const state = { count: 0 };
  const subscribe = vi.fn();
  const getState = vi.fn(() => state);
  const setState = vi.fn();

  let capturedHandleStore: any;
  vi.doMock('coaction', () => ({
    createBinder: ({ handleStore }: { handleStore: any }) => {
      capturedHandleStore = handleStore;
      return (input: unknown) => input;
    }
  }));

  const { bindZustand } = await import('../src');
  const createZustandState = bindZustand(() => state);
  createZustandState(
    () => undefined as any,
    () => state,
    {
      getState,
      subscribe,
      setState
    } as any
  );

  capturedHandleStore(
    {
      share: 'main',
      setState: vi.fn()
    },
    state,
    state,
    {
      rootState: state,
      listeners: new Set()
    }
  );

  expect(subscribe).not.toHaveBeenCalled();
});
