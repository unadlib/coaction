// @ts-nocheck
import {
  defineStore,
  createPinia,
  getActivePinia,
  setActivePinia,
  StoreDefinition
} from 'pinia';
import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slices } from 'coaction/shared';
import { bindPinia, adapt, type PiniaStore } from '../src';
import { persist, type PersistStorage } from '../../coaction-persist/src';

const waitForSharedHydration = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test('pinia', () => {
  const useCounterStore: PiniaStore<{
    count: number;
    readonly doubleCount: number;
    increment: () => void;
  }> = defineStore('counter', {
    state: () => ({ count: 0 }),
    getters: {
      doubleCount: (state) => {
        return state.count * 2;
      }
    },
    actions: {
      increment() {
        this.count++;
      }
    }
  });

  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCounterStore();
  expect(store.count).toBe(0);
  expect(store.doubleCount).toBe(0);
  store.increment();
  expect(store.count).toBe(1);
  expect(store.doubleCount).toBe(2);
  store.$state.count = 10;
  expect(store.count).toBe(10);
  expect(store.doubleCount).toBe(20);
});

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  type Counter = {
    count: number;
    readonly double: number;
    increment: () => void;
    increment1: () => void;
  };
  const useStore = create<Counter>(
    (set, get, store) =>
      adapt<Counter>(
        defineStore(
          'test',
          bindPinia({
            state: () => ({ count: 0 }),
            getters: {
              double: (state) => state.count * 2
            },
            actions: {
              increment1() {
                set(() => {
                  this.count += 1;
                });
              },
              increment() {
                this.count += 1;
                stateFn(get().count, store.getState().count, this.count);
                getterFn(get().double, store.getState().double, this.double);
              }
            }
          })
        )
      ),
    {
      name: 'test'
    }
  );
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.name).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "increment1": [Function],
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  useStore.getState().increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
    2,
    2,
  ],
]
`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "increment1": [Function],
}
`);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
  ],
  [
    2,
    2,
    2,
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
    2,
    2,
  ],
  [
    4,
    4,
    4,
  ],
]
`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "increment1": [Function],
}
`);

  useStore.getState().increment1();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    1,
    1,
    1,
  ],
  [
    2,
    2,
    2,
  ],
]
`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
    2,
    2,
  ],
  [
    4,
    4,
    4,
  ],
]
`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "increment1": [Function],
}
`);
});

test('bindPinia does not replace the active pinia instance', () => {
  const activePinia = createPinia();
  setActivePinia(activePinia);

  defineStore(
    'active-pinia-preserved',
    bindPinia({
      state: () => ({
        count: 0
      }),
      actions: {
        increment() {
          this.count += 1;
        }
      }
    })
  );

  expect(getActivePinia()).toBe(activePinia);
});

test('adapt forwards explicit pinia and hot arguments', () => {
  const call = jest.fn(() => ({
    count: 0
  }));
  const storeDefinition = Object.assign(call, {
    $id: 'adapt-forward-arguments'
  }) as StoreDefinition;
  const useStore = adapt(storeDefinition) as any;
  const explicitPinia = createPinia();
  const hot = {
    count: 1
  };

  useStore(explicitPinia, hot);

  expect(call).toHaveBeenCalledWith(explicitPinia, hot);
});

test('apply exact replacement removes stale data keys without deleting actions', () => {
  type Counter = {
    a: number;
    b?: number;
    replaceA: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-exact-replace',
          bindPinia({
            state: () => ({
              a: 1,
              b: 2
            }),
            actions: {
              replaceA() {
                this.a = 4;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-exact-replace'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  useStore.apply({
    a: 3
  } as any);

  expect(useStore.getState().a).toBe(3);
  expect((useStore.getState() as any).b).toBeUndefined();
  expect(piniaStore.b).toBeUndefined();
  expect(typeof useStore.getState().replaceA).toBe('function');
  useStore.getState().replaceA();
  expect(useStore.getState().a).toBe(4);
});

test('apply patches sync root removal and reject unknown root keys atomically', () => {
  type Counter = {
    count: number;
    stale?: number;
    nested: {
      value: number;
    };
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-patch-apply-guards',
          bindPinia({
            state: () => ({
              count: 0,
              stale: 1,
              nested: {
                value: 1
              }
            })
          })
        )
      ),
    {
      name: 'test-pinia-patch-apply-guards'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  useStore.apply(useStore.getPureState(), [
    {
      op: 'remove',
      path: ['stale']
    }
  ] as any);

  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), 'stale')
  ).toBe(false);
  expect((useStore.getState() as any).stale).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(piniaStore, 'stale')).toBe(false);

  useStore.apply(undefined, [
    {
      op: 'replace',
      path: ['count'],
      value: 2
    }
  ] as any);
  expect(useStore.getPureState()).toEqual({
    count: 2,
    nested: {
      value: 1
    }
  });
  expect(Object.prototype.hasOwnProperty.call(piniaStore, 'stale')).toBe(false);

  useStore.apply(
    useStore.getState() as any,
    [
      {
        op: 'replace',
        path: ['count'],
        value: 3
      }
    ] as any
  );
  expect(useStore.getPureState()).toEqual({
    count: 3,
    nested: {
      value: 1
    }
  });
  expect(Object.prototype.hasOwnProperty.call(piniaStore, 'stale')).toBe(false);

  expect(() => {
    useStore.apply(useStore.getPureState(), [
      {
        op: 'replace',
        path: ['count'],
        value: 5
      },
      {
        op: 'add',
        path: ['extra'],
        value: 1
      }
    ] as any);
  }).toThrow(
    "Unknown state key 'extra' cannot be added after store initialization. Coaction state schema is fixed."
  );
  expect(useStore.getState().count).toBe(3);
  expect(useStore.getPureState().count).toBe(3);
  expect(piniaStore.count).toBe(3);
  expect((useStore.getState() as any).extra).toBeUndefined();
  expect((useStore.getPureState() as any).extra).toBeUndefined();
  expect(piniaStore.extra).toBeUndefined();
});

test('re-added root keys stay linked to pinia external state', async () => {
  type Counter = {
    count: number;
    stale?: number;
  };
  const definition = adapt<Counter>(
    defineStore(
      'test-pinia-readd-linkage',
      bindPinia({
        state: () => ({
          count: 0,
          stale: 1
        })
      })
    )
  ) as any;
  const piniaStore = definition();
  const useStore = create<Counter>(() => definition, {
    name: 'test-pinia-readd-linkage'
  });

  useStore.apply(useStore.getPureState(), [
    {
      op: 'remove',
      path: ['stale']
    }
  ] as any);
  useStore.apply(useStore.getPureState(), [
    {
      op: 'add',
      path: ['stale'],
      value: 2
    }
  ] as any);

  expect(useStore.getPureState().stale).toBe(2);
  expect(useStore.getState().stale).toBe(2);
  expect(piniaStore.stale).toBe(2);

  piniaStore.stale = 3;
  await waitForSharedHydration();

  expect(useStore.getPureState().stale).toBe(3);
  expect(useStore.getState().stale).toBe(3);
  expect(piniaStore.stale).toBe(3);
});

test('shared exact replacement removes root keys from server and client mutable state', async () => {
  type Counter = {
    count: number;
    stale?: number;
    increment: () => void;
  };
  const createDefinition = (id: string) =>
    adapt<Counter>(
      defineStore(
        id,
        bindPinia({
          state: () => ({
            count: 0,
            stale: 1
          }),
          actions: {
            increment() {
              this.count += 1;
            }
          }
        })
      )
    ) as any;
  const storage: PersistStorage = {
    getItem: () =>
      JSON.stringify({
        state: {
          count: 10
        },
        version: 0
      }),
    setItem: () => undefined,
    removeItem: () => undefined
  };
  const ports = mockPorts();
  const name = 'test-pinia-shared-exact-replace';
  const serverDefinition = createDefinition(`${name}-server`);
  const clientDefinition = createDefinition(`${name}-client`);
  const serverExternal = serverDefinition();
  const clientExternal = clientDefinition();
  const serverStore = create<Counter>(() => serverDefinition, {
    name,
    transport: createTransport('WebWorkerInternal', ports.main),
    middlewares: [
      persist({
        name,
        storage,
        merge: (persistedState) => persistedState
      })
    ]
  });
  const clientStore = create<Counter>(() => clientDefinition, {
    name,
    clientTransport: createTransport(
      'WebWorkerClient',
      ports.create() as WorkerMainTransportOptions
    )
  });

  try {
    await waitForSharedHydration();

    expect(serverStore.getPureState()).toEqual({
      count: 10
    });
    expect(clientStore.getPureState()).toEqual({
      count: 10
    });
    expect(Object.prototype.hasOwnProperty.call(serverExternal, 'stale')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(clientExternal, 'stale')).toBe(
      false
    );
    expect((serverStore.getState() as any).stale).toBeUndefined();
    expect((clientStore.getState() as any).stale).toBeUndefined();

    serverStore.getState().increment();
    await waitForSharedHydration();

    expect(serverStore.getPureState()).toEqual({
      count: 11
    });
    expect(clientStore.getPureState()).toEqual({
      count: 11
    });
    expect(Object.prototype.hasOwnProperty.call(serverExternal, 'stale')).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(clientExternal, 'stale')).toBe(
      false
    );
  } finally {
    clientStore.destroy();
    serverStore.destroy();
  }
});

test('apply rejects invalid replacement atomically and after destroy', () => {
  type Counter = {
    count: number;
    stale: number;
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-apply-guards',
          bindPinia({
            state: () => ({
              count: 0,
              stale: 1
            }),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-apply-guards'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  expect(() => {
    useStore.apply({
      count: 1,
      extra: 2
    } as any);
  }).toThrow(
    "Unknown state key 'extra' cannot be added after store initialization. Coaction state schema is fixed."
  );
  expect(useStore.getState().count).toBe(0);
  expect(useStore.getPureState().count).toBe(0);
  expect(piniaStore.count).toBe(0);
  expect(useStore.getState().stale).toBe(1);
  expect(useStore.getPureState().stale).toBe(1);
  expect(piniaStore.stale).toBe(1);
  expect((useStore.getState() as any).extra).toBeUndefined();
  expect((useStore.getPureState() as any).extra).toBeUndefined();
  expect(piniaStore.extra).toBeUndefined();

  useStore.destroy();
  expect(() => {
    useStore.subscribe(() => undefined);
  }).toThrow('subscribe cannot be called after store.destroy().');
  expect(() => {
    useStore.apply({
      count: 1
    } as any);
  }).toThrow('apply cannot be called after store.destroy().');
  expect(piniaStore.count).toBe(0);
  expect(piniaStore.stale).toBe(1);
});

test('apply handles circular and shared replacement values with fixed schema', () => {
  type Counter = {
    count: number;
    left: unknown;
    right: unknown;
    self: unknown;
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-circular-replace',
          bindPinia({
            state: () => ({
              count: 0,
              left: null,
              right: null,
              self: null
            }),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-circular-replace'
    }
  );
  const shared = {
    value: 2
  };
  const payload = {
    count: 1,
    left: shared,
    right: shared
  } as any;
  payload.self = payload;

  useStore.apply(payload);

  const current = useStore.getState() as any;
  const pure = useStore.getPureState() as any;
  expect(current.self.self).toBe(current.self);
  expect(pure.self.self).toBe(pure.self);
  expect(current.left).toBe(current.right);
  expect(pure.left).toBe(pure.right);
  expect(current.left).toEqual({
    value: 2
  });
  expect(typeof current.increment).toBe('function');
});

test('apply ignores unsafe prototype keys during replacement', () => {
  type Counter = {
    count: number;
    nested: {
      value: number;
    };
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-unsafe-replace',
          bindPinia({
            state: () => ({
              count: 0,
              nested: {
                value: 0
              }
            }),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-unsafe-replace'
    }
  );
  const payload = JSON.parse(
    '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}},"__proto__":{"polluted":true},"constructor":{"value":2},"prototype":{"value":3}}'
  );

  useStore.apply(payload as any);

  expect(useStore.getState().count).toBe(1);
  expect(useStore.getState().nested).toEqual({
    value: 2
  });
  expect(Object.getPrototypeOf(useStore.getState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(useStore.getPureState())).toBe(Object.prototype);
  expect(Object.getPrototypeOf(useStore.getPureState().nested)).toBe(
    Object.prototype
  );
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getPureState(), '__proto__')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), 'constructor')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(useStore.getState(), 'prototype')
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      '__proto__'
    )
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      'constructor'
    )
  ).toBe(false);
});

test('initial state ignores nested unsafe prototype keys', () => {
  type Counter = {
    count: number;
    nested: {
      value: number;
    };
    increment: () => void;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-unsafe-initial',
          bindPinia({
            state: () =>
              JSON.parse(
                '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}}}'
              ),
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      ),
    {
      name: 'test-pinia-unsafe-initial'
    }
  );

  expect(useStore.getState().nested).toEqual({
    value: 2
  });
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      '__proto__'
    )
  ).toBe(false);
  expect(
    Object.prototype.hasOwnProperty.call(
      useStore.getPureState().nested,
      'constructor'
    )
  ).toBe(false);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
});

test('supports state-only stores without actions', () => {
  type Counter = {
    count: number;
  };
  const useStore = create<Counter>(
    () =>
      adapt<Counter>(
        defineStore(
          'test-pinia-state-only',
          bindPinia({
            state: () => ({
              count: 0
            })
          })
        )
      ),
    {
      name: 'test-pinia-state-only'
    }
  );
  const piniaStore = useStore.getPureState() as any;

  expect(useStore.getState().count).toBe(0);
  useStore.setState({
    count: 2
  });
  expect(useStore.getState().count).toBe(2);
  expect(piniaStore.count).toBe(2);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  type Counter = {
    count: number;
    increment: () => void;
  };

  const counter = () =>
    adapt<Counter>(
      defineStore(
        'test',
        bindPinia({
          state: () => ({ count: 0 }),
          getters: {
            double: (state) => {
              return state.count * 2;
            }
          },
          actions: {
            increment() {
              this.count += 1;
            }
          }
        })
      )
    );
  const useServerStore = create(counter, {
    transport: serverTransport,
    name: 'test'
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.name).toBe('test');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
  {
    const useClientStore = create(counter, {
      name: 'test',
      clientTransport
    });

    await new Promise((resolve) => {
      clientTransport.onConnect(() => {
        setTimeout(resolve);
      });
    });
    const { count, increment } = useClientStore();
    expect(count).toBe(2);
    expect(increment).toBeInstanceOf(Function);
    expect(useClientStore.name).toBe('test');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
    increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
  }
});

describe('Slices', () => {
  test('base - unsupported', () => {
    expect(() => {
      create(
        {
          counter: (() =>
            adapt(
              defineStore(
                'test',
                bindPinia({
                  state: () => ({ count: 0 }),
                  getters: {
                    double: (state) => {
                      return state.count * 2;
                    }
                  },
                  actions: {
                    increment() {
                      this.count += 1;
                    }
                  }
                })
              )
            )) satisfies Slices<
            {
              counter: {
                count: number;
                readonly double: number;
                increment: () => void;
              };
            },
            'counter'
          >
        },
        {
          name: 'test',
          sliceMode: 'slices'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
  test('worker - unsupported', () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WebWorkerInternal', ports.main);
    const counter: Slices<
      {
        counter: {
          count: number;
          increment: () => void;
        };
      },
      'counter'
    > = () =>
      adapt(
        defineStore(
          'test',
          bindPinia({
            state: () => ({ count: 0 }),
            getters: {
              double(state) {
                return this.count * 2;
              }
            },
            actions: {
              increment() {
                this.count += 1;
              }
            }
          })
        )
      );
    expect(() => {
      create(
        { counter },
        {
          name: 'test',
          transport: serverTransport,
          sliceMode: 'slices'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
