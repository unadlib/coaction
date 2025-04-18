import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slice, type Slices } from '../src';
import { isDraft } from 'mutative';

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
    increment1: () => void;
  }>((set, get, store) => ({
    count: 0,
    double: get(
      (state) => [state.count],
      (count) => count * 2
    ),
    increment1() {
      set({
        count: this.count + 1
      });
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
  }));
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.name).toBe('default');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
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
  "count": 3,
  "double": 6,
  "increment": [Function],
  "increment1": [Function],
}
`);
});

test('base - error handling', () => {
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
    increment1: () => void;
  }>((set, get, store) => ({
    count: 0,
    double: get(
      (state) => [state.count],
      (count) => count * 2
    ),
    increment1() {
      set({
        count: this.count + 1
      });
    },
    increment() {
      set((draft) => {
        this.count += 1;
        throw new Error('test');
      });
    }
  }));
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.name).toBe('default');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
  "increment1": [Function],
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  expect(() => useStore.getState().increment()).toThrow('test');
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
  "increment1": [Function],
}
`);
});

test('base - error handling and enablePatches', () => {
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
    increment1: () => void;
  }>(
    (set, get, store) => ({
      count: 0,
      double: get(
        (state) => [state.count],
        (count) => count * 2
      ),
      increment1() {
        set({
          count: this.count + 1
        });
      },
      increment() {
        set((draft) => {
          this.count += 1;
          throw new Error('test');
        });
      }
    }),
    {
      enablePatches: true
    }
  );
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.name).toBe('default');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
  "increment1": [Function],
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  expect(() => useStore.getState().increment()).toThrow('test');
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
  "increment1": [Function],
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
    transport: serverTransport
  });
  const { count, increment } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useServerStore.name).toBe('default');
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
    expect(useClientStore.name).toBe('default');
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

describe('Slices', () => {
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create({
      counter: ((set, get, store) => ({
        count: 0,
        get count1() {
          return this.count;
        },
        double: get(
          (state) => [state.counter.count1],
          (count) => count * 2
        ),
        increment1() {
          set({
            counter: {
              count: this.count + 1
            }
          });
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
            readonly count1: number;
            readonly double: number;
            increment1: () => void;
            increment: () => void;
          };
        },
        'counter'
      >
    });
    const { count, increment } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useStore.name).toBe('default');
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 0,
    "count1": 0,
    "double": 0,
    "increment": [Function],
    "increment1": [Function],
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
    "count1": 1,
    "double": 2,
    "increment": [Function],
    "increment1": [Function],
  },
}
`);
    increment();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 2,
    "count1": 2,
    "double": 4,
    "increment": [Function],
    "increment1": [Function],
  },
}
`);

    useStore.getState().counter.increment1();
    expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "counter": {
    "count": 3,
    "count1": 3,
    "double": 6,
    "increment": [Function],
    "increment1": [Function],
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

    const useServerStore = create(
      {
        counter
      },
      {
        transport: serverTransport,
        workerType: 'WebWorkerInternal'
      }
    );
    const { count, increment } = useServerStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useServerStore.name).toBe('default');
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
      expect(useClientStore.name).toBe('default');
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
