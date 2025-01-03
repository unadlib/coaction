import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slice, type Slices } from '../src';

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    (set, get, store) => ({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        set((draft) => {
          this.count += 1;
          stateFn(get().count, store.getState().count, this.count, draft.count);
          getterFn(
            get().double,
            store.getState().double,
            this.double,
            draft.double
          );
        });
        stateFn(get().count, store.getState().count, this.count);
        getterFn(get().double, store.getState().double, this.double);
      }
    }),
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
    1,
  ],
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
    2,
  ],
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
    1,
  ],
  [
    1,
    1,
    1,
  ],
  [
    2,
    2,
    2,
    2,
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
    2,
  ],
  [
    2,
    2,
    2,
  ],
  [
    4,
    4,
    4,
    4,
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
  }> = (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  });
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
}
`);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    const returnValue0 = useClientStore.getState().increment();
    expect(returnValue0 instanceof Promise).toBeTruthy();
    await returnValue0;
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
    const returnValue1 = increment();
    expect(returnValue1 instanceof Promise).toBeTruthy();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
  }
});

test('worker without transport', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: Slice<{
    count: number;
    increment: () => void;
  }> = (set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  });
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
    expect(() => {
      const useStore = create(counter, {
        name: 'test',
        // clientTransport,
        workerType: 'WebWorkerClient'
      });
    }).toThrowErrorMatchingInlineSnapshot(`"transport is required"`);
  }
});

describe('Slices', () => {
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create(
      {
        counter: ((set, get, store) => ({
          count: 0,
          get double() {
            return this.count * 2;
          },
          increment() {
            set((draft) => {
              draft.counter.count += 1;
              stateFn(
                get().counter.count,
                store.getState().counter.count,
                this.count,
                draft.counter.count
              );
              getterFn(
                get().counter.double,
                store.getState().counter.double,
                this.double,
                draft.counter.double
              );
            });
            stateFn(
              get().counter.count,
              store.getState().counter.count,
              this.count
            );
            getterFn(
              get().counter.double,
              store.getState().counter.double,
              this.double
            );
          }
        })) satisfies Slices<
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
    const { count, increment } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useStore.name).toBe('test');
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "double": 0,
    "increment": [Function],
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
    "double": 2,
    "increment": [Function],
  },
}
`);
    increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "double": 4,
    "increment": [Function],
  },
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

    const counter: Slices<
      {
        counter: {
          count: number;
          increment: () => void;
        };
      },
      'counter'
    > = (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.counter.count += 1;
        });
      }
    });

    const counter1: Slices<
      {
        counter1: {
          count: number;
          increment: () => void;
        };
      },
      'counter1'
    > = (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.counter1.count += 1;
        });
      }
    });

    // TODO: improve type for slices
    const useServerStore = create<{
      counter: Slices<
        {
          counter: {
            count: number;
            increment: () => void;
          };
        },
        'counter'
      >;
      counter1: Slices<
        {
          counter1: {
            count: number;
            increment: () => void;
          };
        },
        'counter1'
      >;
    }>(
      {
        counter,
        counter1
      },
      {
        name: 'test',
        transport: serverTransport,
        workerType: 'WebWorkerInternal'
      }
    );
    const { count, increment } = useServerStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useServerStore.name).toBe('test');
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  {
    "count": 0,
    "increment": [Function],
  }
  `);
    const fn = jest.fn();
    useServerStore.subscribe(fn);
    useServerStore.getState().counter.increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
}
`);
    increment();
    expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
    {
      const useClientStore = create(
        { counter },
        {
          name: 'test',
          clientTransport,
          workerType: 'WebWorkerClient'
        }
      );
      await new Promise((resolve) => {
        clientTransport.onConnect(() => {
          setTimeout(resolve);
        });
      });
      const { count, increment } = useClientStore().counter;
      expect(count).toBe(2);
      expect(increment).toBeInstanceOf(Function);
      expect(useClientStore.name).toBe('test');
      expect(useClientStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "increment": [Function],
  },
}
`);
      const fn = jest.fn();
      useClientStore.subscribe(fn);
      const returnValue0 = useClientStore.getState().counter.increment();
      expect(returnValue0 instanceof Promise).toBeTruthy();
      await returnValue0;
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
      const returnValue1 = increment();
      expect(returnValue1 instanceof Promise).toBeTruthy();
      await returnValue1;
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
    }
  });
});
