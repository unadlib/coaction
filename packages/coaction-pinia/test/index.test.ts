import { defineStore, createPinia, setActivePinia } from 'pinia';
import { createTransport, mockPorts } from 'data-transport';
import { create } from 'coaction';
import { bindPinia } from '../src';

test('pinia', () => {
  const useCounterStore = defineStore('counter', {
    state: () => ({ count: 0, name: 'Eduardo' }),
    getters: {
      doubleCount: (state) => state.count * 2
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
  store.increment();
  store.$state.count = 10;
  expect(store.count).toBe(10);
});

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create((set, get, api) =>
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
    )
  );
  const { count, increment, name } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe('test');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "name": "test",
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
  "name": "test",
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
  "name": "test",
}
`);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WorkerInternal', ports.main);
  const clientTransport = createTransport('WorkerMain', ports.create());

  const counter = () =>
    defineStore(
      'test',
      bindPinia({
        state: () => ({ count: 0 }),
        getters: {
          double() {
            return this.count * 2;
          }
        },
        actions: {
          increment() {
            this.count += 1;
          }
        }
      })
    );
  const useServerStore = create(counter, {
    transport: serverTransport,
    workerType: 'WorkerInternal'
  });
  // TODO: fix this
  // @ts-ignore
  const { count, increment, name } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe('test');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "name": "test",
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "test",
}
`);
  increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "test",
}
`);
  {
    const useClientStore = create(counter)({
      transport: clientTransport,
      workerType: 'WorkerMain'
    });

    await new Promise((resolve) => {
      clientTransport.onConnect(() => {
        setTimeout(resolve);
      });
    });

    // @ts-ignore
    const { count, increment, name } = useClientStore();
    expect(count).toBe(2);
    expect(increment).toBeInstanceOf(Function);
    expect(name).toBe('test');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "test",
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "name": "test",
}
`);
    increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "name": "test",
}
`);
  }
});

describe('Slices', () => {
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create({
      counter: (set, get, api) =>
        defineStore(
          'test',
          bindPinia({
            state: () => ({ count: 0 }),
            getters: {
              double() {
                return this.count * 2;
              }
            },
            actions: {
              increment(state) {
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
        )
    });
    // TODO: fix this
    // @ts-ignore
    const { count, increment, name } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(name).toBe('test');
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "increment": [Function],
    "name": "test",
  },
  "name": "default",
}
`);
    const fn = jest.fn();
    useStore.subscribe(fn);
    // @ts-ignore
    useStore.getState().counter.increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 1,
    "increment": [Function],
    "name": "test",
  },
  "name": "default",
}
`);
    increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
    "name": "test",
  },
  "name": "default",
}
`);
  });
  test('worker', async () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WorkerInternal', ports.main);
    const clientTransport = createTransport('WorkerMain', ports.create());

    const counter = () =>
      defineStore(
        'test',
        bindPinia({
          state: () => ({ count: 0 }),
          getters: {
            double() {
              return this.count * 2;
            }
          },
          actions: {
            increment() {
              this.count += 1;
            }
          }
        })
      );
    const useServerStore = create(
      { counter },
      {
        transport: serverTransport,
        workerType: 'WorkerInternal'
      }
    );
    // TODO: fix this
    // @ts-ignore
    const { count, increment, name } = useServerStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(name).toBe('test');
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  {
    "count": 0,
    "increment": [Function],
    "name": "test",
  }
  `);
    const fn = jest.fn();
    useServerStore.subscribe(fn);
    useServerStore.getState().counter.increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "test",
}
`);
    increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "test",
}
`);
    {
      const useClientStore = create({ counter })({
        transport: clientTransport,
        workerType: 'WorkerMain'
      });
      await new Promise((resolve) => {
        clientTransport.onConnect(() => {
          setTimeout(resolve);
        });
      });

      // @ts-ignore
      const { count, increment, name } = useClientStore().counter;
      expect(count).toBe(2);
      expect(increment).toBeInstanceOf(Function);
      expect(name).toBe('test');
      expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
    "name": "test",
  },
  "name": "default",
}
`);
      const fn = jest.fn();
      useClientStore.subscribe(fn);
      useClientStore.getState().counter.increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
  "name": "test",
}
`);
      increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
  "name": "test",
}
`);
    }
  });
});
