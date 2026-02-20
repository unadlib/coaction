import { createAsyncClientStore } from '../src/asyncClientStore';
import { applyMiddlewares } from '../src/applyMiddlewares';
import { create } from '../src/create';
import { getInitialState } from '../src/getInitialState';
import { handleMainTransport } from '../src/handleMainTransport';
import { vi } from 'vitest';

const createStoreLike = () => ({
  name: 'test',
  share: false,
  setState: vi.fn(() => []),
  getState: vi.fn(() => ({})),
  subscribe: vi.fn(() => () => undefined),
  destroy: vi.fn(),
  apply: vi.fn(),
  getPureState: vi.fn(() => ({}))
});

test('applyMiddlewares validates middleware type in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    expect(() => {
      applyMiddlewares(createStoreLike() as any, [null as any]);
    }).toThrow('middlewares[0] should be a function');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('applyMiddlewares validates middleware return shape in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    expect(() => {
      applyMiddlewares(createStoreLike() as any, [() => ({}) as any]);
    }).toThrow('middlewares[0] should return a store-like object');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('applyMiddlewares validates null middleware return in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    expect(() => {
      applyMiddlewares(createStoreLike() as any, [() => null as any]);
    }).toThrow('middlewares[0] should return a store-like object');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('createAsyncClientStore requires transport.onConnect', () => {
  expect(() => {
    createAsyncClientStore(
      () => ({
        store: {
          name: 'client',
          apply: vi.fn(),
          getState: vi.fn(() => ({}))
        } as any,
        internal: {
          sequence: 0
        } as any
      }),
      {
        clientTransport: {
          emit: vi.fn(),
          listen: vi.fn()
        } as any
      } as any
    );
  }).toThrow('transport.onConnect is required');
});

test('createAsyncClientStore performs fullSync on sequence mismatch', async () => {
  let onConnectHandler: (() => Promise<void>) | undefined;
  let updateHandler: ((options: any) => Promise<void>) | undefined;
  const apply = vi.fn();
  const transport = {
    emit: vi.fn(async (event: any) => {
      if (event === 'fullSync') {
        return {
          state: JSON.stringify({
            count: 1
          }),
          sequence: 1
        };
      }
      return undefined;
    }),
    onConnect: vi.fn((handler: () => Promise<void>) => {
      onConnectHandler = handler;
    }),
    listen: vi.fn((name: string, handler: (options: any) => Promise<void>) => {
      if (name === 'update') {
        updateHandler = handler;
      }
    })
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({
          count: 0
        })
      } as any,
      internal: {
        sequence: 0
      } as any
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await onConnectHandler?.();
  await updateHandler?.({
    sequence: 99,
    patches: []
  });

  expect(transport.emit).toHaveBeenCalledWith('fullSync');
  expect(apply).toHaveBeenCalledWith({
    count: 1
  });
});

test('WorkerType chooses shared worker global first', async () => {
  const workerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'WorkerGlobalScope'
  );
  vi.resetModules();
  vi.doMock('../src/global', () => ({
    global: {
      SharedWorkerGlobalScope: function SharedWorkerGlobalScope() {}
    }
  }));
  Object.defineProperty(globalThis, 'WorkerGlobalScope', {
    value: function WorkerGlobalScope() {},
    configurable: true
  });
  const { WorkerType } = await import('../src/constant');
  expect(WorkerType).toBe('SharedWorkerInternal');
  vi.doUnmock('../src/global');
  vi.resetModules();
  if (workerDescriptor) {
    Object.defineProperty(globalThis, 'WorkerGlobalScope', workerDescriptor);
  } else {
    delete (globalThis as any).WorkerGlobalScope;
  }
});

test('WorkerType chooses web worker global when shared is absent', async () => {
  const workerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'WorkerGlobalScope'
  );
  vi.resetModules();
  vi.doMock('../src/global', () => ({
    global: {
      SharedWorkerGlobalScope: undefined
    }
  }));
  Object.defineProperty(globalThis, 'WorkerGlobalScope', {
    value: function WorkerGlobalScope() {},
    configurable: true
  });
  const { WorkerType } = await import('../src/constant');
  expect(WorkerType).toBe('WebWorkerInternal');
  vi.doUnmock('../src/global');
  vi.resetModules();
  if (workerDescriptor) {
    Object.defineProperty(globalThis, 'WorkerGlobalScope', workerDescriptor);
  } else {
    delete (globalThis as any).WorkerGlobalScope;
  }
});

test('WorkerType is null when no worker globals exist', async () => {
  const workerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'WorkerGlobalScope'
  );
  vi.resetModules();
  vi.doMock('../src/global', () => ({
    global: {
      SharedWorkerGlobalScope: undefined
    }
  }));
  delete (globalThis as any).WorkerGlobalScope;
  const { WorkerType } = await import('../src/constant');
  expect(WorkerType).toBeNull();
  vi.doUnmock('../src/global');
  vi.resetModules();
  if (workerDescriptor) {
    Object.defineProperty(globalThis, 'WorkerGlobalScope', workerDescriptor);
  }
});

test('create rejects transport and clientTransport together in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    expect(() => {
      create(
        () => ({
          count: 0
        }),
        {
          transport: {} as any,
          clientTransport: {} as any
        } as any
      );
    }).toThrow(
      'transport and clientTransport cannot be used together, please use one of them.'
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('create validates explicit slices mode and supports valid slices mode', () => {
  expect(() => {
    create(
      null as any,
      {
        sliceMode: 'slices'
      } as any
    );
  }).toThrow(
    "sliceMode: 'slices' requires createState to be an object of slice functions."
  );
  const useStore = create(
    {
      counter: () => ({
        count: 0
      })
    },
    {
      sliceMode: 'slices'
    }
  );
  expect(useStore.isSliceStore).toBeTruthy();
  expect(useStore.getState().counter.count).toBe(0);
});

test('create requires enablePatches for async store', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        workerType: 'WebWorkerClient',
        enablePatches: false
      } as any
    );
  }).toThrow('enablePatches: true is required for the async store');
});

test('getInitialState handles invalid state values in development and production', () => {
  const fakeStore = {
    isSliceStore: false,
    setState: vi.fn(),
    getState: vi.fn()
  } as any;
  expect(() => {
    getInitialState(fakeStore, 1 as any, {} as any);
  }).toThrow('Invalid state value encountered in makeState: number');

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    expect(getInitialState(fakeStore, 1 as any, {} as any)).toEqual({});
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('handleMainTransport validates onConnect and normalizes non-Error throws', async () => {
  expect(() => {
    handleMainTransport(
      {
        name: 'no-on-connect',
        getState: () => ({})
      } as any,
      {
        rootState: {},
        sequence: 0
      } as any,
      {
        listen: vi.fn()
      } as any,
      null,
      false
    );
  }).toThrow('transport.onConnect is required');

  let executeHandler:
    | ((keys: string[], args: unknown[]) => Promise<any>)
    | null = null;
  const transport = {
    onConnect: vi.fn(),
    listen: vi.fn((name: string, handler: any) => {
      if (name === 'execute') {
        executeHandler = handler;
      }
    })
  };
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    handleMainTransport(
      {
        name: 'main',
        getState: () => ({
          bad() {
            throw 123;
          }
        })
      } as any,
      {
        rootState: {},
        sequence: 0
      } as any,
      transport as any,
      null,
      false
    );
    const [result] = (await executeHandler?.(['bad'], [])) as [any, number];
    expect(result).toEqual({
      $$Error: '123'
    });
    expect(errorSpy).toHaveBeenCalled();
  } finally {
    process.env.NODE_ENV = prev;
    errorSpy.mockRestore();
  }
});
