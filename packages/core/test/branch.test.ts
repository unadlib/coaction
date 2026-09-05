import { createAsyncClientStore } from '../src/asyncClientStore';
import { applyMiddlewares } from '../src/applyMiddlewares';
import { create } from '../src/create';
import { applyMutableAdapterPatches } from '../src/externalMutableAdapterUtils';
import { getInitialState } from '../src/getInitialState';
import { handleMainTransport } from '../src/handleMainTransport';
import { handleDraft } from '../src/handleDraft';
import type { TransportPolicyRequest } from '../src/interface';
import { replaceExternalStoreState } from '../src/replaceExternalStoreState';
import {
  decodeExecuteResponse,
  encodeExecuteRequest,
  encodeExecuteResponse,
  encodeFullSyncRequest,
  encodeFullSyncResponse,
  encodeUpdateMessage
} from '../src/transportProtocol';
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

test('mutable adapter patches validate before any state is replaced', () => {
  const rawState = { count: 0 };
  const mutableState = { count: 0 };
  const publicState = { count: 0 };
  const validateState = vi.fn(() => {
    throw new TypeError('invalid transport state');
  });

  expect(() =>
    applyMutableAdapterPatches(
      publicState,
      [
        {
          op: 'replace',
          path: ['count'],
          value: new Date(0)
        }
      ] as any,
      rawState,
      mutableState,
      publicState,
      validateState
    )
  ).toThrow('invalid transport state');

  expect(validateState).toHaveBeenCalledWith({ count: new Date(0) });
  expect(rawState.count).toBe(0);
  expect(mutableState.count).toBe(0);
  expect(publicState.count).toBe(0);
});

test('external store replacement validates before apply and emit', () => {
  const store = {
    apply: vi.fn()
  } as any;
  const internal = {
    emitPatches: vi.fn(),
    rootState: { count: 0 },
    sequence: 0,
    validateState: vi.fn(() => {
      throw new TypeError('invalid transport state');
    })
  } as any;

  expect(() =>
    replaceExternalStoreState(store, internal, {
      count: new Date(0),
      increment: () => undefined
    })
  ).toThrow('invalid transport state');
  expect(internal.validateState).toHaveBeenCalledWith({ count: new Date(0) });
  expect(store.apply).not.toHaveBeenCalled();
  expect(internal.emitPatches).not.toHaveBeenCalled();
});

test('external store replacement publishes through the injected runtime', () => {
  const store = {
    apply: vi.fn()
  } as any;
  const internal = {
    emitPatches: vi.fn(),
    rootState: { count: 0 }
  } as any;

  replaceExternalStoreState(store, internal, {
    count: 1
  });

  expect(store.apply).toHaveBeenCalledWith(
    internal.rootState,
    expect.arrayContaining([
      expect.objectContaining({
        op: 'replace',
        path: ['count'],
        value: 1
      })
    ])
  );
  expect(internal.emitPatches).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        op: 'replace',
        path: ['count'],
        value: 1
      })
    ])
  );
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

test('applyMiddlewares accepts valid store-like middleware return in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const nextStore = createStoreLike();
    const result = applyMiddlewares(createStoreLike() as any, [
      () => nextStore as any
    ]);
    expect(result).toBe(nextStore);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('applyMiddlewares validates each required store-like method in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const invalidStores = [
      {
        ...createStoreLike(),
        getState: undefined
      },
      {
        ...createStoreLike(),
        subscribe: undefined
      },
      {
        ...createStoreLike(),
        destroy: undefined
      },
      {
        ...createStoreLike(),
        apply: undefined
      },
      {
        ...createStoreLike(),
        getPureState: undefined
      }
    ];

    invalidStores.forEach((nextStore) => {
      expect(() => {
        applyMiddlewares(createStoreLike() as any, [() => nextStore as any]);
      }).toThrow('middlewares[0] should return a store-like object');
    });
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('createAsyncClientStore requires transport.onConnect', () => {
  const dispose = vi.fn();
  const store = {
    name: 'client',
    apply: vi.fn(),
    getState: vi.fn(() => ({})),
    destroy: vi.fn(() => store.transport?.dispose()),
    transport: undefined as any
  };
  expect(() => {
    createAsyncClientStore(
      () => ({
        store: store as any,
        internal: {
          sequence: 0
        } as any
      }),
      {
        clientTransport: {
          dispose,
          emit: vi.fn(),
          listen: vi.fn()
        } as any
      } as any
    );
  }).toThrow('transport.onConnect is required');
  expect(store.destroy).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test('createAsyncClientStore applies a JSON full sync on connect', async () => {
  let onConnectHandler: (() => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 0
  } as any;
  const transport = {
    emit: vi.fn(async (event: string) => {
      if (event === 'fullSync') {
        return encodeFullSyncResponse({
          epoch: 'epoch-1',
          sequence: 1,
          state: {
            count: 1,
            nested: {
              value: 3
            }
          }
        });
      }
      throw new Error('Unexpected event: ' + event);
    }),
    onConnect: vi.fn((handler: () => Promise<void>) => {
      onConnectHandler = handler;
    }),
    listen: vi.fn()
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 0 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await onConnectHandler?.();

  expect(transport.emit).toHaveBeenCalledWith(
    'fullSync',
    encodeFullSyncRequest()
  );
  expect(apply).toHaveBeenCalledWith({
    count: 1,
    nested: {
      value: 3
    }
  });
  expect(internal.transportEpoch).toBe('epoch-1');
  expect(internal.sequence).toBe(1);
});

test('createAsyncClientStore ignores stale and duplicate JSON updates', async () => {
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 5,
    transportEpoch: 'epoch-1'
  } as any;
  const transport = {
    emit: vi.fn(),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 5 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await updateHandler?.(encodeUpdateMessage('epoch-1', 4, []));
  await updateHandler?.(encodeUpdateMessage('epoch-1', 5, []));

  expect(transport.emit).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

test('createAsyncClientStore applies the next incremental JSON update', async () => {
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 0,
    transportEpoch: 'epoch-1'
  } as any;
  const transport = {
    emit: vi.fn(),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 0 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await updateHandler?.(
    encodeUpdateMessage('epoch-1', 1, [
      {
        op: 'replace',
        path: ['count'],
        value: 1
      }
    ])
  );

  expect(apply).toHaveBeenCalledWith(undefined, [
    {
      op: 'replace',
      path: ['count'],
      value: 1
    }
  ]);
  expect(internal.sequence).toBe(1);
});

test('createAsyncClientStore full-syncs a same-epoch sequence gap', async () => {
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 1,
    transportEpoch: 'epoch-1'
  } as any;
  const transport = {
    emit: vi.fn(async (event: string) => {
      if (event === 'fullSync') {
        return encodeFullSyncResponse({
          epoch: 'epoch-1',
          sequence: 3,
          state: {
            count: 3
          }
        });
      }
      throw new Error('Unexpected event: ' + event);
    }),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 1 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await updateHandler?.(encodeUpdateMessage('epoch-1', 3, []));

  expect(transport.emit).toHaveBeenCalledWith(
    'fullSync',
    encodeFullSyncRequest()
  );
  expect(apply).toHaveBeenCalledWith({ count: 3 });
  expect(internal.sequence).toBe(3);
});

test('createAsyncClientStore full-syncs when the authority epoch changes', async () => {
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 5,
    transportEpoch: 'epoch-old'
  } as any;
  const transport = {
    emit: vi.fn(async (event: string) => {
      if (event === 'fullSync') {
        return encodeFullSyncResponse({
          epoch: 'epoch-new',
          sequence: 1,
          state: {
            count: 1
          }
        });
      }
      throw new Error('Unexpected event: ' + event);
    }),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 5 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await updateHandler?.(encodeUpdateMessage('epoch-new', 1, []));

  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith({ count: 1 });
  expect(internal.transportEpoch).toBe('epoch-new');
  expect(internal.sequence).toBe(1);
});

test('createAsyncClientStore rolls back metadata and full-syncs after apply failure', async () => {
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const apply = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('bad patches');
    })
    .mockImplementation(() => undefined);
  const internal = {
    sequence: 0,
    transportEpoch: 'epoch-1'
  } as any;
  const transport = {
    emit: vi.fn(async (event: string) => {
      if (event === 'fullSync') {
        return encodeFullSyncResponse({
          epoch: 'epoch-1',
          sequence: 1,
          state: {
            count: 1
          }
        });
      }
      throw new Error('Unexpected event: ' + event);
    }),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 0 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  await expect(
    updateHandler?.(encodeUpdateMessage('epoch-1', 1, []))
  ).resolves.toBeUndefined();

  expect(apply).toHaveBeenNthCalledWith(1, undefined, []);
  expect(apply).toHaveBeenNthCalledWith(2, { count: 1 });
  expect(internal.transportEpoch).toBe('epoch-1');
  expect(internal.sequence).toBe(1);
});

test('createAsyncClientStore serializes connect sync before queued updates', async () => {
  let onConnectHandler: (() => Promise<void>) | undefined;
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  let resolveFullSync: ((value: string) => void) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 5,
    transportEpoch: 'epoch-old'
  } as any;
  const transport = {
    emit: vi.fn((event: string) => {
      if (event === 'fullSync') {
        return new Promise<string>((resolve) => {
          resolveFullSync = resolve;
        });
      }
      throw new Error('Unexpected event: ' + event);
    }),
    onConnect: vi.fn((handler: () => Promise<void>) => {
      onConnectHandler = handler;
    }),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  createAsyncClientStore(
    () => ({
      store: {
        name: 'client',
        apply,
        getState: () => ({ count: 5 })
      } as any,
      internal
    }),
    {
      clientTransport: transport as any
    } as any
  );

  const connecting = onConnectHandler?.();
  const updating = updateHandler?.(
    encodeUpdateMessage('epoch-new', 4, [
      {
        op: 'replace',
        path: ['count'],
        value: 4
      }
    ])
  );
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();

  if (!resolveFullSync) {
    throw new Error('Expected pending fullSync resolver');
  }
  resolveFullSync(
    encodeFullSyncResponse({
      epoch: 'epoch-new',
      sequence: 3,
      state: {
        count: 3
      }
    })
  );
  await connecting;
  await updating;

  expect(apply).toHaveBeenNthCalledWith(1, { count: 3 });
  expect(apply).toHaveBeenNthCalledWith(2, undefined, [
    {
      op: 'replace',
      path: ['count'],
      value: 4
    }
  ]);
  expect(internal.sequence).toBe(4);
});

test('createAsyncClientStore reports invalid connect payloads without applying them', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  let onConnectHandler: (() => Promise<void>) | undefined;
  const apply = vi.fn();
  const internal = {
    sequence: 0
  } as any;
  const transport = {
    emit: vi.fn(async () => ({ state: {}, sequence: 1 })),
    onConnect: vi.fn((handler: () => Promise<void>) => {
      onConnectHandler = handler;
    }),
    listen: vi.fn()
  };

  try {
    createAsyncClientStore(
      () => ({
        store: {
          name: 'client',
          apply,
          getState: () => ({})
        } as any,
        internal
      }),
      {
        clientTransport: transport as any
      } as any
    );

    await expect(onConnectHandler?.()).rejects.toThrow(
      'Shared transport payload must be a JSON string'
    );
    expect(errorSpy).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(internal.sequence).toBe(0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    errorSpy.mockRestore();
  }
});

test('createAsyncClientStore reports update-time full-sync failures', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  let updateHandler: ((message: string) => Promise<void>) | undefined;
  const transport = {
    emit: vi.fn(async () => {
      throw new Error('update sync failed');
    }),
    onConnect: vi.fn(),
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<void>) => {
        if (name === 'update') {
          updateHandler = handler;
        }
      }
    )
  };

  try {
    createAsyncClientStore(
      () => ({
        store: {
          name: 'client',
          apply: vi.fn(),
          getState: () => ({})
        } as any,
        internal: {
          sequence: 0,
          transportEpoch: 'epoch-1'
        } as any
      }),
      {
        clientTransport: transport as any
      } as any
    );

    await expect(
      updateHandler?.(encodeUpdateMessage('epoch-1', 2, []))
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'update sync failed'
      })
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    errorSpy.mockRestore();
  }
});

const createDestroyableClient = async (execute: () => Promise<string>) => {
  let connect: (() => Promise<void>) | undefined;
  const transport = {
    emit: vi.fn((event: string) => {
      if (event === 'fullSync') {
        return Promise.resolve(
          encodeFullSyncResponse({
            epoch: 'epoch-1',
            sequence: 0,
            state: {
              count: 0
            }
          })
        );
      }
      if (event === 'execute') {
        return execute();
      }
      return Promise.reject(new Error('Unexpected event: ' + event));
    }),
    onConnect: vi.fn((handler: () => Promise<void>) => {
      connect = handler;
      return () => undefined;
    }),
    listen: vi.fn(() => () => undefined),
    dispose: vi.fn()
  };
  const store = create(
    () => ({
      count: 0,
      increment() {}
    }),
    {
      clientTransport: transport as any
    }
  );
  await connect?.();
  return { store, transport };
};

test('destroy rejects an action waiting for its transport response', async () => {
  const { store, transport } = await createDestroyableClient(
    () => new Promise(() => undefined)
  );
  const pending = store.getState().increment();

  store.destroy();

  await expect(pending).rejects.toThrow('Client transport was destroyed');
  expect(transport.dispose).toHaveBeenCalledTimes(1);
});

test('destroy rejects an action waiting for sequence catch-up', async () => {
  const { store } = await createDestroyableClient(() =>
    Promise.resolve(
      encodeExecuteResponse({
        epoch: 'epoch-1',
        ok: true,
        sequence: 2
      })
    )
  );
  const pending = store.getState().increment();
  await new Promise((resolve) => setTimeout(resolve));

  store.destroy();

  await expect(pending).rejects.toThrow('Client transport was destroyed');
});

test('handleDraft uses patch hook before applying patches', () => {
  const patch = vi.fn(({ patches, inversePatches }) => ({
    patches,
    inversePatches
  }));
  const apply = vi.fn();
  handleDraft(
    {
      patch,
      apply
    } as any,
    {
      rootState: {
        count: 0
      },
      backupState: {
        count: 0
      },
      finalizeDraft: () => [
        undefined,
        [
          {
            op: 'replace',
            path: ['count'],
            value: 1
          }
        ],
        [
          {
            op: 'replace',
            path: ['count'],
            value: 0
          }
        ]
      ]
    } as any
  );
  expect(patch).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledTimes(1);
});

test('handleDraft rejects unsafe patch-hook output before apply and emit', () => {
  const safePatch = {
    op: 'replace',
    path: ['count'],
    value: 2
  };
  const unsafePatch = {
    op: 'replace',
    path: ['constructor', 'polluted'],
    value: true
  };
  const apply = vi.fn();
  const transport = {
    emit: vi.fn()
  };
  expect(() => {
    handleDraft(
      {
        patch: () => ({
          patches: [unsafePatch, safePatch],
          inversePatches: []
        }),
        apply,
        transport
      } as any,
      {
        rootState: {
          count: 0
        },
        backupState: {
          count: 0
        },
        sequence: 0,
        finalizeDraft: () => [
          undefined,
          [
            {
              op: 'replace',
              path: ['count'],
              value: 1
            }
          ],
          []
        ]
      } as any
    );
  }).toThrow(
    "Unsafe patch path 'constructor.polluted' cannot be applied from store.patch()."
  );
  expect(apply).not.toHaveBeenCalled();
  expect(transport.emit).not.toHaveBeenCalled();
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
    'transport and clientTransport cannot be used together, please use one authority model per store.'
  );
});

test('create rejects transport and worker together', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        transport: {} as any,
        worker: {} as any
      } as any
    );
  }).toThrow(
    'transport and worker cannot be used together, please use one authority model per store.'
  );
});

test('create rejects clientTransport and worker together', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        clientTransport: {} as any,
        worker: {} as any
      } as any
    );
  }).toThrow(
    'clientTransport and worker cannot be used together, please use one client transport source.'
  );
});

test('create rejects main workerType with client transport settings', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        workerType: 'WebWorkerInternal',
        clientTransport: {} as any
      } as any
    );
  }).toThrow(
    'main workerType cannot be combined with client transport settings.'
  );
});

test('create rejects client workerType with transport', () => {
  expect(() => {
    create(
      () => ({
        count: 0
      }),
      {
        workerType: 'WebWorkerClient',
        transport: {} as any
      } as any
    );
  }).toThrow('client workerType cannot be combined with transport.');
});

test('create rejects symbol keyed state in main shared store mode', () => {
  const symbolSlice = Symbol('shared-slice');

  expect(() => {
    create(
      {
        [symbolSlice]: () => ({
          count: 0
        })
      } as any,
      {
        workerType: 'WebWorkerInternal'
      } as any
    );
  }).toThrow(
    'Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at Symbol(shared-slice).'
  );
});

test('create rejects nested symbol keyed state in client shared store mode', () => {
  const symbolKey = Symbol('nested-state');

  expect(() => {
    create(
      () => ({
        nested: {
          [symbolKey]: 1
        }
      }),
      {
        clientTransport: {} as any
      } as any
    );
  }).toThrow(
    'Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at nested.Symbol(nested-state).'
  );
});

test('create rejects symbol valued state in shared store mode', () => {
  expect(() => {
    create(
      () => ({
        nested: {
          value: Symbol('nested-value')
        }
      }),
      {
        clientTransport: {} as any
      } as any
    );
  }).toThrow(
    'Symbol-valued state is not supported because this state is synchronized as JSON. Found symbol value at nested.value.'
  );
});

test.each([
  [
    'BigInt',
    { value: 1n },
    'BigInt-valued state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  ],
  [
    'undefined object value',
    { value: undefined },
    'Undefined-valued state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  ],
  [
    'NaN',
    { value: Number.NaN },
    'NaN or infinite number state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  ],
  [
    'Infinity',
    { value: Infinity },
    'NaN or infinite number state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  ],
  [
    'nested function data',
    {
      nested: {
        fn: () => undefined
      }
    },
    'Function-valued state is not supported because this state is synchronized as JSON. Found unsupported value at nested.fn.'
  ],
  [
    'Date',
    { value: new Date('2024-01-01T00:00:00.000Z') },
    'Non-plain object state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  ]
])('create rejects %s state in shared store mode', (_, state, message) => {
  expect(() => {
    create(() => state as any, {
      clientTransport: {} as any
    });
  }).toThrow(message);
});

test('shared store allows action functions while validating raw JSON state', () => {
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    onConnect: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set({
          count: this.count + 1
        });
      }
    }),
    {
      transport: transport as any
    }
  );

  expect(store.getState().count).toBe(0);
});

test('shared store rejects runtime symbol keyed state before emitting patches', () => {
  const symbolKey = Symbol('runtime-state');
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    onConnect: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      count: 0,
      nested: {} as Record<PropertyKey, unknown>,
      addSymbol() {
        set((draft) => {
          draft.nested[symbolKey] = 1;
        });
      }
    }),
    {
      transport: transport as any
    }
  );

  expect(() => store.getState().addSymbol()).toThrow(
    'Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at nested.Symbol(runtime-state).'
  );
  expect(
    Object.getOwnPropertySymbols(store.getPureState().nested)
  ).toHaveLength(0);
  expect(transport.emit).not.toHaveBeenCalled();
});

test('shared store rejects runtime symbol valued state before emitting patches', () => {
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    onConnect: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      value: 0 as number | symbol,
      setSymbol() {
        set({
          value: Symbol('runtime-value')
        });
      }
    }),
    {
      transport: transport as any
    }
  );

  expect(() => store.getState().setSymbol()).toThrow(
    'Symbol-valued state is not supported because this state is synchronized as JSON. Found symbol value at value.'
  );
  expect(store.getPureState().value).toBe(0);
  expect(transport.emit).not.toHaveBeenCalled();
});

test('shared store rejects non-JSON patch-hook output before committing', () => {
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      count: 0,
      increment() {
        set({ count: 1 });
      }
    }),
    {
      transport: transport as any,
      middlewares: [
        (middlewareStore) => {
          middlewareStore.patch = ({ patches, inversePatches }) => ({
            patches: [
              {
                op: 'replace',
                path: ['count'],
                value: undefined
              },
              ...patches
            ] as any,
            inversePatches
          });
          return middlewareStore;
        }
      ]
    }
  );

  try {
    expect(() => store.getState().increment()).toThrow(
      'Undefined-valued state'
    );
    expect(store.getPureState().count).toBe(0);
    expect(transport.emit).not.toHaveBeenCalled();
  } finally {
    store.destroy();
  }
});

test('shared store rejects runtime accessors before normalization', () => {
  let reads = 0;
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      nested: { value: 0 },
      replaceNested() {
        const nested = {} as { value: number };
        Object.defineProperty(nested, 'value', {
          enumerable: true,
          get() {
            reads += 1;
            return 1;
          }
        });
        set({ nested });
      }
    }),
    { transport: transport as any }
  );

  try {
    expect(() => store.getState().replaceNested()).toThrow(
      'Accessor-backed state'
    );
    expect(reads).toBe(0);
    expect(store.getPureState().nested).toEqual({ value: 0 });
    expect(transport.emit).not.toHaveBeenCalled();
  } finally {
    store.destroy();
  }
});

test('shared store rejects nested runtime functions before normalization', () => {
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    (set) => ({
      nested: { value: 0 },
      replaceNested() {
        set({
          nested: {
            value: 1,
            ignored() {}
          } as any
        });
      }
    }),
    { transport: transport as any }
  );

  try {
    expect(() => store.getState().replaceNested()).toThrow(
      'Function-valued state'
    );
    expect(store.getPureState().nested).toEqual({ value: 0 });
    expect(transport.emit).not.toHaveBeenCalled();
  } finally {
    store.destroy();
  }
});

test('shared store validates replacement state before normalization', () => {
  let reads = 0;
  const transport = {
    emit: vi.fn(),
    listen: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(() => ({ count: 0 }), {
    transport: transport as any
  });
  const replacement = {} as { count: number };
  Object.defineProperty(replacement, 'count', {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    }
  });

  try {
    expect(() => store.apply(replacement)).toThrow('Accessor-backed state');
    expect(reads).toBe(0);
    expect(store.getPureState().count).toBe(0);
    expect(() => store.apply([] as any)).toThrow(
      'Non-record replacement state'
    );
    expect(store.getPureState().count).toBe(0);
    expect(transport.emit).not.toHaveBeenCalled();
  } finally {
    store.destroy();
  }
});

test('shared store validates state again before fullSync serialization', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const transport = {
    emit: vi.fn(),
    listen: vi.fn((name: string, handler: (...args: any[]) => unknown) => {
      handlers.set(name, handler);
    }),
    onConnect: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    () => ({
      value: 0 as number | symbol
    }),
    {
      transport: transport as any
    }
  );
  store.getPureState().value = Symbol('full-sync');

  await expect(
    handlers.get('fullSync')!(encodeFullSyncRequest())
  ).rejects.toThrow(
    'Symbol-valued state is not supported because this state is synchronized as JSON. Found symbol value at value.'
  );
});

test('shared store validates BigInt again before fullSync serialization', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const transport = {
    emit: vi.fn(),
    listen: vi.fn((name: string, handler: (...args: any[]) => unknown) => {
      handlers.set(name, handler);
    }),
    onConnect: vi.fn(),
    dispose: vi.fn()
  };
  const store = create(
    () => ({
      value: 0 as number | bigint
    }),
    {
      transport: transport as any
    }
  );
  store.getPureState().value = 1n;

  await expect(
    handlers.get('fullSync')!(encodeFullSyncRequest())
  ).rejects.toThrow(
    'BigInt-valued state is not supported because this state is synchronized as JSON. Found unsupported value at value.'
  );
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
        clientTransport: {} as any,
        enablePatches: false
      } as any
    );
  }).toThrow('enablePatches: true is required for the async store');
});

test('create preserves deprecated client workerType compatibility', () => {
  expect(() => {
    create(() => ({ count: 0 }), {
      workerType: 'WebWorkerClient'
    });
  }).toThrow('transport is required');
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

test('getInitialState invalid slice value includes the slice key in error', () => {
  const fakeStore = {
    isSliceStore: true,
    setState: vi.fn(),
    getState: vi.fn()
  } as any;

  expect(() => {
    getInitialState(
      fakeStore,
      {
        counter: 1 as any
      } as any,
      {} as any
    );
  }).toThrow(
    'Invalid state value encountered in makeState: for key counter, number'
  );
});

test('getInitialState validates non-object state factory results', () => {
  const fakeStore = {
    isSliceStore: false,
    setState: vi.fn(),
    getState: vi.fn()
  } as any;

  expect(() => {
    getInitialState(fakeStore, (() => 1) as any, {} as any);
  }).toThrow('Invalid state result encountered in makeState: number');

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    expect(getInitialState(fakeStore, (() => 1) as any, {} as any)).toEqual({});
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('getInitialState validates non-object slice factory results with key', () => {
  const fakeStore = {
    isSliceStore: true,
    setState: vi.fn(),
    getState: vi.fn()
  } as any;

  expect(() => {
    getInitialState(
      fakeStore,
      {
        counter: (() => 1) as any
      } as any,
      {} as any
    );
  }).toThrow(
    'Invalid state result encountered in makeState: for key counter, number'
  );
});

test('handleMainTransport accepts server transports without onConnect', () => {
  const listen = vi.fn();

  expect(() => {
    handleMainTransport(
      {
        name: 'server',
        getState: () => ({})
      } as any,
      {
        rootState: {},
        sequence: 0,
        sharedActionPaths: new Set()
      } as any,
      {
        listen
      } as any,
      null,
      false
    );
  }).not.toThrow();

  expect(listen).toHaveBeenCalledTimes(2);
});

test('handleMainTransport redacts non-Error throws in tagged JSON', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  const transport = {
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<string>) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
      }
    )
  };
  const previousNodeEnv = process.env.NODE_ENV;
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
        sequence: 0,
        sharedActionPaths: new Set([JSON.stringify(['bad'])])
      } as any,
      transport as any,
      null,
      false
    );

    const response = decodeExecuteResponse(
      await executeHandler!(encodeExecuteRequest(['bad'], []))
    );
    expect(response).toEqual(
      expect.objectContaining({
        error: 'Remote action failed',
        ok: false,
        sequence: 0
      })
    );
    expect(errorSpy).toHaveBeenCalled();
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    errorSpy.mockRestore();
  }
});

test('handleMainTransport only exposes action errors through mapError', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  const mapError = vi.fn(
    async (error: unknown, request: TransportPolicyRequest) => {
      expect(error).toEqual(new Error('secret token'));
      expect(request.type).toBe('execute');
      if (request.type !== 'execute') {
        return undefined;
      }
      expect(request.action).toEqual(['bad']);
      return 'Public domain failure';
    }
  );
  handleMainTransport(
    {
      name: 'main',
      getState: () => ({
        bad() {
          throw new Error('secret token');
        }
      })
    } as any,
    {
      rootState: {},
      sequence: 0,
      sharedActionPaths: new Set([JSON.stringify(['bad'])])
    } as any,
    {
      listen: vi.fn((name: string, handler: any) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
      })
    } as any,
    null,
    false,
    { mapError }
  );

  const response = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['bad'], []))
  );

  expect(response).toEqual(
    expect.objectContaining({
      error: 'Public domain failure',
      ok: false
    })
  );
  expect(JSON.stringify(response)).not.toContain('secret token');
  expect(mapError).toHaveBeenCalledTimes(1);

  mapError.mockRejectedValueOnce(new Error('mapper secret'));
  const fallback = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['bad'], []))
  );
  expect(fallback).toEqual(
    expect.objectContaining({
      error: 'Remote action failed',
      ok: false
    })
  );
  expect(JSON.stringify(fallback)).not.toContain('mapper secret');
});

test('handleMainTransport only executes declared own action paths', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  const transport = {
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<string>) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
      }
    )
  };

  handleMainTransport(
    {
      name: 'main',
      getState: () => ({
        nested: {
          value: 3,
          read() {
            return this.value;
          }
        }
      })
    } as any,
    {
      rootState: {},
      sequence: 0,
      sharedActionPaths: new Set([JSON.stringify(['nested', 'read'])])
    } as any,
    transport as any,
    null,
    false
  );

  const success = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['nested', 'read'], []))
  );
  expect(success).toEqual(
    expect.objectContaining({
      ok: true,
      sequence: 0,
      value: 3
    })
  );

  const undeclared = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['nested', 'missing'], []))
  );
  expect(undeclared).toEqual(
    expect.objectContaining({
      error: 'Remote action is not allowed',
      ok: false,
      sequence: 0
    })
  );

  const inherited = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['nested', 'toString'], []))
  );
  expect(inherited).toEqual(
    expect.objectContaining({
      error: 'Remote action is not allowed',
      ok: false,
      sequence: 0
    })
  );

  for (const action of [['constructor'], ['__proto__', 'polluted']]) {
    expect(() => encodeExecuteRequest(action, [])).toThrow(
      'Invalid transport action'
    );
  }
});

test('handleMainTransport applies action and authorization policy', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  let fullSyncHandler: ((message: string) => Promise<string>) | undefined;
  const authorize = vi.fn(({ type }) => type === 'fullSync');
  const transport = {
    listen: vi.fn(
      (name: string, handler: (message: string) => Promise<string>) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
        if (name === 'fullSync') {
          fullSyncHandler = handler;
        }
      }
    )
  };

  handleMainTransport(
    {
      name: 'main',
      getState: () => ({
        read() {
          return 1;
        },
        write() {
          return 2;
        }
      })
    } as any,
    {
      rootState: {
        count: 0
      },
      sequence: 0,
      sharedActionPaths: new Set([
        JSON.stringify(['read']),
        JSON.stringify(['write'])
      ])
    } as any,
    transport as any,
    null,
    false,
    {
      allowedActions: [['read']],
      authorize
    }
  );

  const deniedByAuthorization = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['read'], []))
  );
  expect(deniedByAuthorization).toEqual(
    expect.objectContaining({
      error: 'Transport request is not authorized',
      ok: false
    })
  );

  const deniedByAllowlist = decodeExecuteResponse(
    await executeHandler!(encodeExecuteRequest(['write'], []))
  );
  expect(deniedByAllowlist).toEqual(
    expect.objectContaining({
      error: 'Remote action is not allowed',
      ok: false
    })
  );

  await expect(fullSyncHandler!(encodeFullSyncRequest())).resolves.toEqual(
    expect.any(String)
  );
});

test('handleMainTransport cleans partial listener setup failures', () => {
  const disposeExecute = vi.fn();
  const disposeTransport = vi.fn();
  const internal = {
    destroyCallbacks: new Set<() => void>(),
    rootState: {},
    sequence: 0,
    sharedActionPaths: new Set()
  } as any;
  const store = {
    name: 'main',
    getState: () => ({})
  } as any;
  const listen = vi
    .fn()
    .mockReturnValueOnce(disposeExecute)
    .mockImplementationOnce(() => {
      throw new Error('fullSync listener failed');
    });

  expect(() =>
    handleMainTransport(
      store,
      internal,
      {
        dispose: disposeTransport,
        listen
      } as any,
      null,
      false
    )
  ).toThrow('fullSync listener failed');

  expect(disposeExecute).toHaveBeenCalledTimes(1);
  expect(disposeTransport).toHaveBeenCalledTimes(1);
  expect(internal.destroyCallbacks).toHaveLength(0);
  expect(store.transport).toBeUndefined();
});

test('handleMainTransport reports a declared path that is no longer a function', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  handleMainTransport(
    {
      name: 'main',
      getState: () => ({ removed: 1 })
    } as any,
    {
      rootState: {},
      sequence: 0,
      sharedActionPaths: new Set([JSON.stringify(['removed'])])
    } as any,
    {
      listen: vi.fn((name: string, handler: any) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
      })
    } as any,
    null,
    false
  );

  expect(
    decodeExecuteResponse(
      await executeHandler!(encodeExecuteRequest(['removed'], []))
    )
  ).toEqual(
    expect.objectContaining({
      error: 'The function is not found',
      ok: false
    })
  );
});

test('handleMainTransport cancels an in-flight authorized action on destroy', async () => {
  let executeHandler: ((message: string) => Promise<string>) | undefined;
  let resolveAuthorization!: (allowed: boolean) => void;
  const destroyCallbacks = new Set<() => void>();
  handleMainTransport(
    {
      name: 'main',
      getState: () => ({
        read() {
          return 1;
        }
      })
    } as any,
    {
      destroyCallbacks,
      rootState: {},
      sequence: 0,
      sharedActionPaths: new Set([JSON.stringify(['read'])])
    } as any,
    {
      listen: vi.fn((name: string, handler: any) => {
        if (name === 'execute') {
          executeHandler = handler;
        }
        return () => undefined;
      })
    } as any,
    null,
    false,
    {
      authorize: () =>
        new Promise<boolean>((resolve) => {
          resolveAuthorization = resolve;
        })
    }
  );

  const pending = executeHandler!(encodeExecuteRequest(['read'], []));
  await Promise.resolve();
  destroyCallbacks.forEach((destroy) => destroy());
  resolveAuthorization(true);

  expect(decodeExecuteResponse(await pending)).toEqual(
    expect.objectContaining({
      error: 'Transport request was cancelled after store destroy',
      ok: false
    })
  );
});

test('handleMainTransport rejects non-record full-sync state', async () => {
  let fullSyncHandler: ((message: string) => Promise<string>) | undefined;
  handleMainTransport(
    {
      name: 'main',
      getState: () => ({})
    } as any,
    {
      rootState: [],
      sequence: 0,
      sharedActionPaths: new Set()
    } as any,
    {
      listen: vi.fn((name: string, handler: any) => {
        if (name === 'fullSync') {
          fullSyncHandler = handler;
        }
      })
    } as any,
    null,
    false
  );

  await expect(fullSyncHandler!(encodeFullSyncRequest())).rejects.toThrow(
    'Shared store state must be a JSON object'
  );
});

test('createAsyncClientStore cleans partial listener setup failures', () => {
  const disposeUpdate = vi.fn();
  const disposeTransport = vi.fn();
  const internal = {
    destroyCallbacks: new Set<() => void>(),
    sequence: 0
  } as any;
  const store = {
    apply: vi.fn(),
    getState: () => ({}),
    name: 'client',
    transport: undefined as any,
    destroy: vi.fn(() => {
      const callbacks = [...internal.destroyCallbacks] as Array<() => void>;
      internal.destroyCallbacks.clear();
      callbacks.forEach((callback) => callback());
      store.transport?.dispose();
    })
  };

  expect(() =>
    createAsyncClientStore(
      () => ({
        store: store as any,
        internal
      }),
      {
        clientTransport: {
          dispose: disposeTransport,
          emit: vi.fn(),
          listen: vi.fn(() => disposeUpdate),
          onConnect: vi.fn(() => {
            throw new Error('connect listener failed');
          })
        } as any
      }
    )
  ).toThrow('connect listener failed');

  expect(disposeUpdate).toHaveBeenCalledTimes(1);
  expect(disposeTransport).toHaveBeenCalledTimes(1);
  expect(store.destroy).toHaveBeenCalledTimes(1);
  expect(internal.destroyCallbacks).toHaveLength(0);
});
