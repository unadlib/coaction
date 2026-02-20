import { vi } from 'vitest';

const restoreSharedWorker = (
  descriptor: PropertyDescriptor | undefined,
  key: 'SharedWorker'
) => {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    delete (globalThis as any)[key];
  }
};

test('createAsyncClientStore uses SharedWorkerClient when worker is SharedWorker', async () => {
  vi.resetModules();
  const createTransport = vi.fn(() => ({
    emit: vi.fn(async () => ({
      state: JSON.stringify({
        count: 0
      }),
      sequence: 0
    })),
    listen: vi.fn(),
    onConnect: vi.fn()
  }));
  vi.doMock('data-transport', () => ({
    createTransport
  }));
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedWorker'
  );
  class SharedWorkerMock {}
  Object.defineProperty(globalThis, 'SharedWorker', {
    value: SharedWorkerMock,
    configurable: true
  });
  try {
    const { createAsyncClientStore } = await import('../src/asyncClientStore');
    const useStore = createAsyncClientStore(
      () => ({
        store: {
          name: 'client',
          apply: vi.fn(),
          getState: vi.fn(() => ({
            count: 0
          }))
        } as any,
        internal: {
          sequence: 0
        } as any
      }),
      {
        worker: new SharedWorkerMock() as any
      } as any
    );

    expect(createTransport).toHaveBeenCalledWith(
      'SharedWorkerClient',
      expect.objectContaining({
        prefix: 'client'
      })
    );
    expect(useStore()).toEqual({
      count: 0
    });
  } finally {
    vi.doUnmock('data-transport');
    vi.resetModules();
    restoreSharedWorker(descriptor, 'SharedWorker');
  }
});

test('createAsyncClientStore uses WebWorkerClient when worker is not SharedWorker', async () => {
  vi.resetModules();
  const createTransport = vi.fn(() => ({
    emit: vi.fn(async () => ({
      state: JSON.stringify({
        count: 0
      }),
      sequence: 0
    })),
    listen: vi.fn(),
    onConnect: vi.fn()
  }));
  vi.doMock('data-transport', () => ({
    createTransport
  }));
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'SharedWorker'
  );
  class SharedWorkerMock {}
  Object.defineProperty(globalThis, 'SharedWorker', {
    value: SharedWorkerMock,
    configurable: true
  });
  try {
    const { createAsyncClientStore } = await import('../src/asyncClientStore');
    createAsyncClientStore(
      () => ({
        store: {
          name: 'client',
          apply: vi.fn(),
          getState: vi.fn(() => ({
            count: 0
          }))
        } as any,
        internal: {
          sequence: 0
        } as any
      }),
      {
        worker: {} as any
      } as any
    );

    expect(createTransport).toHaveBeenCalledWith(
      'WebWorkerClient',
      expect.objectContaining({
        prefix: 'client'
      })
    );
  } finally {
    vi.doUnmock('data-transport');
    vi.resetModules();
    restoreSharedWorker(descriptor, 'SharedWorker');
  }
});

test('handleMainTransport creates transport for SharedWorkerInternal', async () => {
  vi.resetModules();
  const transport = {
    onConnect: vi.fn(),
    listen: vi.fn()
  };
  const createTransport = vi.fn(() => transport);
  vi.doMock('data-transport', () => ({
    createTransport
  }));
  try {
    const { handleMainTransport } = await import('../src/handleMainTransport');
    const store = {
      name: 'shared-store',
      getState: () => ({})
    } as any;

    handleMainTransport(
      store,
      {
        rootState: {},
        sequence: 0
      } as any,
      undefined,
      'SharedWorkerInternal',
      false
    );

    expect(createTransport).toHaveBeenCalledWith('SharedWorkerInternal', {
      prefix: 'shared-store'
    });
    expect(store.transport).toBe(transport);
  } finally {
    vi.doUnmock('data-transport');
    vi.resetModules();
  }
});
