// @ts-nocheck
import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun, runInAction } from 'mobx';
import { create, type Slices, type Slice } from 'coaction/shared';
import { persist, type PersistStorage } from '../../coaction-persist/src';

const waitForSharedHydration = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test('mobx', async () => {
  const state = makeAutoObservable({
    value: 0,
    get double() {
      return this.value * 2;
    },
    d() {
      this.value++;
    },
    async increment() {
      this.value++;
      await Promise.resolve();
      this.d();
      await Promise.resolve();
      this.d();
    }
  });
  autorun(() => {
    // console.log('state', state.value, state.double);
  });
  await state.increment();
});

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, store) =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            this.count += 1;
            stateFn(get().count, store.getState().count, this.count);
            getterFn(get().double, store.getState().double, this.double);
          }
        })
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
  "double": 0,
  "increment": [Function],
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
  "double": 2,
  "increment": [Function],
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
  "double": 4,
  "increment": [Function],
}
`);
});

test('apply exact replacement removes stale data keys without deleting actions', () => {
  const state = makeAutoObservable(
    bindMobx({
      a: 1,
      b: 2,
      replaceA() {
        this.a = 4;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-exact-replace'
  });

  useStore.apply({
    a: 3
  } as any);

  expect(useStore.getState().a).toBe(3);
  expect((useStore.getState() as any).b).toBeUndefined();
  expect((state as any).b).toBeUndefined();
  expect(typeof useStore.getState().replaceA).toBe('function');
  useStore.getState().replaceA();
  expect(useStore.getState().a).toBe(4);
});

test('apply patches sync root removal and reject unknown root keys atomically', () => {
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      stale: 1,
      nested: {
        value: 1
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-patch-apply-guards'
  });

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
  expect(Object.prototype.hasOwnProperty.call(state, 'stale')).toBe(false);

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
  expect(Object.prototype.hasOwnProperty.call(state, 'stale')).toBe(false);

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
  expect(Object.prototype.hasOwnProperty.call(state, 'stale')).toBe(false);

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
  expect(state.count).toBe(3);
  expect((useStore.getState() as any).extra).toBeUndefined();
  expect((useStore.getPureState() as any).extra).toBeUndefined();
  expect((state as any).extra).toBeUndefined();
});

test('re-added root keys stay linked to mobx external state', async () => {
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      stale: 1
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-readd-linkage'
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
  expect(state.stale).toBe(2);

  runInAction(() => {
    state.stale = 3;
  });
  await Promise.resolve();

  expect(useStore.getPureState().stale).toBe(3);
  expect(useStore.getState().stale).toBe(3);
  expect(state.stale).toBe(3);
});

test('shared exact replacement removes root keys from server and client mutable state', async () => {
  type Counter = {
    count: number;
    stale?: number;
    increment: () => void;
  };
  const createState = () =>
    makeAutoObservable(
      bindMobx({
        count: 0,
        stale: 1,
        increment() {
          this.count += 1;
        }
      })
    ) as Counter;
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
  const name = 'test-mobx-shared-exact-replace';
  const serverExternal = createState();
  const clientExternal = createState();
  const serverStore = create(() => serverExternal, {
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
  const clientStore = create(() => clientExternal, {
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
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      stale: 1,
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-apply-guards'
  });

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
  expect(state.count).toBe(0);
  expect(useStore.getState().stale).toBe(1);
  expect(useStore.getPureState().stale).toBe(1);
  expect(state.stale).toBe(1);
  expect((useStore.getState() as any).extra).toBeUndefined();
  expect((useStore.getPureState() as any).extra).toBeUndefined();
  expect((state as any).extra).toBeUndefined();

  useStore.destroy();
  expect(() => {
    useStore.subscribe(() => undefined);
  }).toThrow('subscribe cannot be called after store.destroy().');
  expect(() => {
    useStore.apply({
      count: 1
    } as any);
  }).toThrow('apply cannot be called after store.destroy().');
  expect(state.count).toBe(0);
  expect(state.stale).toBe(1);
});

test('apply handles circular replacement values with fixed schema', () => {
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      left: null as any,
      right: null as any,
      self: null as any,
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-circular-replace'
  });
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
  expect(current.left).toEqual({
    value: 2
  });
  expect(current.right).toEqual({
    value: 2
  });
  expect(typeof current.increment).toBe('function');
});

test('apply ignores unsafe prototype keys during replacement', () => {
  const state = makeAutoObservable(
    bindMobx({
      count: 0,
      nested: {
        value: 0
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => state, {
    name: 'test-mobx-unsafe-replace'
  });
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
  const initialState = JSON.parse(
    '{"count":1,"nested":{"value":2,"__proto__":{"nested":true},"constructor":{"value":3}}}'
  );
  initialState.increment = function increment() {
    this.count += 1;
  };
  const state = makeAutoObservable(bindMobx(initialState));
  const useStore = create(() => state, {
    name: 'test-mobx-unsafe-initial'
  });

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

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
    increment2: () => void;
    increment3: () => void;
    increment1: () => Promise<void>;
  }> = (set) =>
    makeAutoObservable(
      bindMobx({
        count: 0,
        increment() {
          this.count += 1;
        },
        increment2() {
          this.count += 1;
        },
        async increment1() {
          this.count += 1;
          set(() => {
            this.count += 1;
          });
          this.count += 1;
          set({
            count: this.count + 1
          });
          this.increment2();
        },
        increment3() {
          this.count += 1;
          set(() => {
            this.count += 1;
          });
          this.count += 1;
          set({
            count: this.count + 1
          });
          this.increment2();
        }
      })
    );
  const useServerStore = create(counter, {
    name: 'test',
    transport: serverTransport
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.name).toBe('test');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
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
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    await useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
    await increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);

    await useClientStore.getState().increment1();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 9,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);

    await useClientStore.getState().increment3();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 14,
  "increment": [Function],
  "increment1": [Function],
  "increment2": [Function],
  "increment3": [Function],
}
`);
  }
});

test('worker - async', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = () =>
    makeAutoObservable(
      bindMobx({
        count: 0,
        async increment() {
          this.count += 1;
          await Promise.resolve();
          this.count += 1;
        }
      })
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
  useServerStore.subscribe(() => {
    fn(useServerStore.getState().count);
  });
  expect(fn).not.toHaveBeenCalled();
  await useServerStore.getState().increment();
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
  `);
  await increment();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
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
    expect(count).toBe(4);
    expect(increment).toBeInstanceOf(Function);
    expect(useClientStore.name).toBe('test');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    await useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 6,
  "increment": [Function],
}
`);
    await increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 8,
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
          counter: ((set, get, store) =>
            makeAutoObservable(
              bindMobx({
                count: 0,
                get double() {
                  return this.count * 2;
                },
                increment() {
                  this.count += 1;
                }
              })
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
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
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
