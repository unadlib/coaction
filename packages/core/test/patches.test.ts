import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slice, type Slices } from '../src';

const spyMiddleware = (initializer, spy) => (set, get, store) => {
  spy(store);
  return initializer(set, get, store);
};

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  let spy: ReturnType<typeof jest.spyOn>;
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>(
    spyMiddleware(
      (set, get, store) => ({
        count: 0,
        get double() {
          return this.count * 2;
        },
        increment() {
          set((draft) => {
            this.count += 1;
            stateFn(
              get().count,
              store.getState().count,
              this.count,
              draft.count
            );
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
      (store) => {
        spy = jest.spyOn(store, 'apply');
      }
    ),
    {
      enablePatches: true
    }
  );
  //
  const { count, increment } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(useStore.id).toBe('default');
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "double": 0,
  "increment": [Function],
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  expect(spy).toHaveBeenCalledTimes(0);
  useStore.getState().increment();
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenLastCalledWith({ count: 0 }, [
    { op: 'replace', path: ['count'], value: 1 }
  ]);
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
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenLastCalledWith({ count: 1 }, [
    { op: 'replace', path: ['count'], value: 2 }
  ]);
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
  const serverTransport = createTransport('WorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WorkerMain',
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
  expect(() => {
    const useServerStore = create(counter, {
      transport: serverTransport,
      workerType: 'WorkerInternal',
      id: 'test',
      enablePatches: false
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `"enablePatches: true is required for the transport"`
  );
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
        enablePatches: true
      }
    );
    const spy = jest.spyOn(useStore, 'apply');
    const { count, increment } = useStore().counter;
    expect(count).toBe(0);
    expect(increment).toBeInstanceOf(Function);
    expect(useStore.id).toBe('default');
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
});
