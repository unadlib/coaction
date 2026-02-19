import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create, type Slice, type Slices, Middleware } from '../src';

const logger: (log: (...args: any[]) => void) => Middleware<any> =
  (log) => (store) => {
    const setState = store.setState;
    store.setState = (state, updater) => {
      log('before', JSON.stringify(store.getState()));
      const result = setState(state, updater);
      log('after', JSON.stringify(store.getState()));
      return result;
    };
    return store;
  };

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const logFn = jest.fn();
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
      name: 'test',
      middlewares: [logger(logFn)]
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
  expect(logFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    "before",
    "{"count":0,"double":0}",
  ],
  [
    "after",
    "{"count":1,"double":2}",
  ],
]
`);
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
  expect(logFn.mock.calls).toMatchInlineSnapshot(`
[
  [
    "before",
    "{"count":0,"double":0}",
  ],
  [
    "after",
    "{"count":1,"double":2}",
  ],
  [
    "before",
    "{"count":1,"double":2}",
  ],
  [
    "after",
    "{"count":2,"double":4}",
  ],
]
`);
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

test('middleware can return a replaced store object', () => {
  const calls: string[] = [];
  const replaceStoreMiddleware: Middleware<{
    count: number;
  }> = (store) => {
    const baseSetState = store.setState;
    return {
      ...store,
      setState(next, updater) {
        calls.push('before');
        const result = baseSetState(next, updater);
        calls.push('after');
        return result;
      }
    };
  };
  const useStore = create<{ count: number }>(
    () => ({
      count: 0
    }),
    {
      middlewares: [replaceStoreMiddleware]
    }
  );
  useStore.setState({ count: 1 });
  expect(calls).toMatchInlineSnapshot(`
[
  "before",
  "after",
]
`);
  expect(useStore.getState().count).toBe(1);
});
