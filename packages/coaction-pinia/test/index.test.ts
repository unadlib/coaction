import {
  defineStore,
  createPinia,
  setActivePinia,
  StoreDefinition
} from 'pinia';
import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slices } from 'coaction';
import { bindPinia, adapt, type PiniaStore } from '../src';

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
  "name": undefined,
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
  "name": undefined,
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
  "name": undefined,
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
  "name": undefined,
}
`);
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
    workerType: 'WebWorkerInternal',
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
  "name": undefined,
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": undefined,
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": undefined,
}
`);
  {
    const useClientStore = create(counter, {
      name: 'test',
      clientTransport,
      workerType: 'WebWorkerClient'
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
  "name": undefined,
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "name": undefined,
}
`);
    increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "name": undefined,
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
          name: 'test'
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
          workerType: 'WebWorkerInternal'
        }
      );
    }).toThrow(
      'Third-party state binding does not support Slices mode. Please inject a whole store instead.'
    );
  });
});
