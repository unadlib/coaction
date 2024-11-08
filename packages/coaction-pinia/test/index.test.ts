import { defineStore, createPinia, setActivePinia } from 'pinia';
import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, Slice, Slices } from 'coaction';
import { bindPinia } from '../src';

test('pinia', () => {
  const useCounterStore = defineStore('counter', {
    state: () => ({ count: 0, name: 'Eduardo' }),
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
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, api) =>
      defineStore(
        'test',
        bindPinia({
          state: () => ({ count: 0 }),
          getters: {
            double: (state) => state.count * 2
          },
          actions: {
            increment() {
              this.count += 1;
              stateFn(get().count, api.getState().count, this.count);
              getterFn(get().double, api.getState().double, this.double);
            }
          }
        })
      ) as any,
    {
      id: 'test'
    }
  );
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.id).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
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
  "name": undefined,
}
`);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WorkerMain',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = () =>
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
    ) as any;
  const useServerStore = create(counter, {
    transport: serverTransport,
    workerType: 'WorkerInternal',
    id: 'test'
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.id).toBe('test');
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
      id: 'test'
    })({
      transport: clientTransport,
      workerType: 'WorkerMain'
    });

    await new Promise((resolve) => {
      clientTransport.onConnect(() => {
        setTimeout(resolve);
      });
    });
    const { count, increment } = useClientStore();
    expect(count).toBe(2);
    expect(increment).toBeInstanceOf(Function);
    expect(useClientStore.id).toBe('test');
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
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create(
      {
        counter: ((set, get, api) =>
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
                  stateFn(
                    get().counter.count,
                    api.getState().counter.count,
                    this.count
                  );
                  getterFn(
                    get().counter.double,
                    api.getState().counter.double,
                    this.double
                  );
                }
              }
            })
          ) as any) as Slices<
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
        id: 'test'
      }
    );
    const { count, increment } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useStore.id).toBe('test');
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "increment": [Function],
    "name": undefined,
  },
}
`);
    const fn = jest.fn();
    useStore.subscribe(fn);
    useStore.getState().counter.increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 1,
    "increment": [Function],
    "name": undefined,
  },
}
`);
    increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
    "name": undefined,
  },
}
`);
  });
  test('worker', async () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WorkerInternal', ports.main);
    const clientTransport = createTransport(
      'WorkerMain',
      ports.create() as WorkerMainTransportOptions
    );

    const counter: Slices<
      {
        counter: {
          count: number;
          increment: () => void;
        };
      },
      'counter'
    > = (() =>
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
      )) as any;
    const useServerStore = create(
      { counter },
      {
        id: 'test',
        transport: serverTransport,
        workerType: 'WorkerInternal'
      }
    );
    const { count, increment } = useServerStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useServerStore.id).toBe('test');
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "name": undefined,
}
`);
    const fn = jest.fn();
    useServerStore.subscribe(fn);
    useServerStore.getState().counter.increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": undefined,
}
`);
    increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": undefined,
}
`);
    {
      const useClientStore = create(
        { counter },
        {
          id: 'test'
        }
      )({
        transport: clientTransport,
        workerType: 'WorkerMain'
      });
      await new Promise((resolve) => {
        clientTransport.onConnect(() => {
          setTimeout(resolve);
        });
      });
      const { count, increment } = useClientStore().counter;
      expect(count).toBe(2);
      expect(increment).toBeInstanceOf(Function);
      expect(useClientStore.id).toBe('test');
      expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
    "name": undefined,
  },
}
`);
      const fn = jest.fn();
      useClientStore.subscribe(fn);
      useClientStore.getState().counter.increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "name": undefined,
}
`);
      increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "name": undefined,
}
`);
    }
  });
});
