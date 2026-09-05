import { create, Slices } from 'coaction/shared';
import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { adapt, bindValtio, proxy } from '../src';
import { persist, type PersistStorage } from '../../coaction-persist/src';

const waitForSharedHydration = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test('shared store rejects non-JSON values from adapter snapshots', () => {
  const state = proxy(
    bindValtio({
      stamp: new Date('2026-01-01T00:00:00.000Z')
    })
  );

  expect(() =>
    create(() => adapt(state), {
      transport: {
        dispose() {},
        emit() {},
        listen() {}
      } as any
    })
  ).toThrow(
    'Non-plain object state is not supported because this state is synchronized as JSON. Found unsupported value at stamp.'
  );
});

test('base', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test'
  });
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
}
`);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(1);
  expect(state.count).toBe(1);
  state.count = 10;
  expect(useStore.getState().count).toBe(10);
  expect(useStore.getState().double).toBe(20);
});

test('subscribe reacts to direct proxy mutation', async () => {
  const state = proxy(
    bindValtio({
      count: 0
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test'
  });
  const listener = jest.fn();
  const unsubscribe = useStore.subscribe(() => {
    listener(useStore.getState().count);
  });
  state.count = 1;
  state.count = 2;
  await Promise.resolve();
  unsubscribe();
  expect(listener.mock.calls).toMatchInlineSnapshot(`
[
  [
    2,
  ],
]
`);
});

test('apply handles object replacement and patches', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      stale: 1,
      nested: {
        value: 1
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test'
  });
  useStore.apply({
    count: 5,
    nested: {
      value: 10
    }
  } as any);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 5,
  "increment": [Function],
  "nested": {
    "value": 10,
  },
  "stale": undefined,
}
`);
  expect((useStore.getState() as any).stale).toBeUndefined();
  expect((state as any).stale).toBeUndefined();
  expect(typeof useStore.getState().increment).toBe('function');
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(6);
  useStore.apply(useStore.getState(), [
    {
      op: 'replace',
      path: ['count'],
      value: 9
    }
  ] as any);
  expect(useStore.getState().count).toBe(9);

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
      value: 10
    }
  ] as any);
  expect(useStore.getPureState()).toEqual({
    count: 10,
    nested: {
      value: 10
    }
  });
  expect(Object.prototype.hasOwnProperty.call(state, 'stale')).toBe(false);

  useStore.apply(
    useStore.getState() as any,
    [
      {
        op: 'replace',
        path: ['count'],
        value: 11
      }
    ] as any
  );
  expect(useStore.getPureState()).toEqual({
    count: 11,
    nested: {
      value: 10
    }
  });
  expect(Object.prototype.hasOwnProperty.call(state, 'stale')).toBe(false);

  expect(() => {
    useStore.apply(useStore.getPureState(), [
      {
        op: 'replace',
        path: ['count'],
        value: 12
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
  expect(useStore.getState().count).toBe(11);
  expect(useStore.getPureState().count).toBe(11);
  expect(state.count).toBe(11);
  expect((useStore.getState() as any).extra).toBeUndefined();
  expect((useStore.getPureState() as any).extra).toBeUndefined();
  expect((state as any).extra).toBeUndefined();
});

test('re-added root keys stay linked to valtio external state', async () => {
  const state = proxy(
    bindValtio({
      count: 0,
      stale: 1
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test-valtio-readd-linkage'
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

  state.stale = 3;
  await waitForSharedHydration();

  expect(useStore.getPureState().stale).toBe(3);
  expect(useStore.getState().stale).toBe(3);
  expect(state.stale).toBe(3);
});

test('apply rejects invalid replacement atomically and after destroy', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      stale: 1,
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state as any), {
    name: 'test-valtio-apply-guards'
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

test('shared exact replacement removes root keys from server and client mutable state', async () => {
  type Counter = {
    count: number;
    stale?: number;
    increment: () => void;
  };
  const createState = () =>
    proxy(
      bindValtio({
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
  const name = 'test-valtio-shared-exact-replace';
  const serverExternal = createState();
  const clientExternal = createState();
  const serverStore = create(() => adapt(serverExternal), {
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
  const clientStore = create(() => adapt(clientExternal), {
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

test('apply handles circular and shared replacement values with fixed schema', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      left: null as any,
      right: null as any,
      self: null as any,
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state as any), {
    name: 'test-valtio-circular-replace'
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
  expect(current.left).toBe(current.right);
  expect(pure.left).toBe(pure.right);
  expect(current.left).toEqual({
    value: 2
  });
  expect(typeof current.increment).toBe('function');
});

test('apply ignores unsafe prototype keys during replacement', () => {
  const state = proxy(
    bindValtio({
      count: 0,
      nested: {
        value: 0
      },
      increment() {
        this.count += 1;
      }
    })
  );
  const useStore = create(() => adapt(state), {
    name: 'test-valtio-unsafe-replace'
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
  const state = proxy(bindValtio(initialState));
  const useStore = create(() => adapt(state), {
    name: 'test-valtio-unsafe-initial'
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

describe('Slices', () => {
  test('base - unsupported', () => {
    const state = proxy(
      bindValtio({
        count: 0,
        increment() {
          this.count += 1;
        }
      })
    );
    expect(() => {
      create<{
        counter: Slices<
          {
            counter: {
              count: number;
              increment: () => void;
            };
          },
          'counter'
        >;
      }>(
        {
          counter: () => adapt(state)
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
});
