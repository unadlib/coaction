// @ts-nocheck
import { create, effect, Slices } from 'coaction/shared';
import {
  createTransport,
  mockPorts,
  WorkerMainTransportOptions
} from 'data-transport';
import { create as createWithZustand, StateCreator } from 'zustand';
import { bindZustand, adapt } from '../src';

test('base', () => {
  const stateFn = jest.fn();
  const getterFn = jest.fn();
  const counter: StateCreator<
    {
      count: number;
      increment: () => void;
    },
    [],
    []
  > = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const useStore = create(
    () => adapt(createWithZustand(bindZustand(counter))),
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
}
`);
  const fn = jest.fn();
  useStore.subscribe(fn);
  useStore.getState().increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
}
`);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
});

test('initializer get callback reads latest state', () => {
  const useStore = create(
    () =>
      adapt(
        createWithZustand(
          bindZustand((set, get) => ({
            count: 0,
            increment() {
              set({ count: get().count + 1 });
            }
          }))
        )
      ),
    {
      name: 'test-getter'
    }
  );
  useStore.getState().increment();
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
});

test('initializer set and get callbacks work before coaction binding', () => {
  const useStore = create(
    () =>
      adapt(
        createWithZustand(
          bindZustand((set, get) => {
            set({
              count: 1
            });
            return {
              count: get().count,
              increment() {
                set({
                  count: get().count + 1
                });
              }
            };
          })
        )
      ),
    {
      name: 'test-initializer-set-get'
    }
  );

  expect(useStore.getState().count).toBe(1);
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(2);
});

test('worker main propagates direct zustand mutations', async () => {
  type Counter = {
    count: number;
    increment: () => void;
  };
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const counter: StateCreator<Counter, [], []> = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const underlyingStore = createWithZustand(bindZustand(counter));
  const useServerStore = create(() => adapt(underlyingStore), {
    transport: serverTransport,
    name: 'test-worker-main'
  });
  const serverListener = jest.fn();
  const signalValues: number[] = [];
  useServerStore.subscribe(serverListener);
  const stop = effect(() => {
    signalValues.push(useServerStore.getState().count);
  });
  const useClientStore = create(
    () => adapt(createWithZustand(bindZustand(counter))),
    {
      clientTransport,
      name: 'test-worker-main'
    }
  );
  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });
  const clientListener = jest.fn();
  useClientStore.subscribe(clientListener);

  underlyingStore.setState({ count: 6 });
  await new Promise((resolve) => {
    setTimeout(resolve);
  });
  stop();

  expect(useServerStore.getState().count).toBe(6);
  expect(serverListener).toHaveBeenCalledTimes(1);
  expect(signalValues).toEqual([0, 6]);
  expect(useClientStore.getState().count).toBe(6);
  expect(clientListener).toHaveBeenCalled();
});

test('worker main propagates initializer replace updates', async () => {
  type Counter = {
    count: number;
    replaceToSeven: () => void;
  };
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const counter: StateCreator<Counter, [], []> = (set) => ({
    count: 0,
    replaceToSeven() {
      set(
        {
          count: 7
        } as Counter,
        true
      );
    }
  });
  let underlyingStore: ReturnType<typeof createWithZustand<Counter>>;
  const useServerStore = create(
    () => {
      underlyingStore = createWithZustand(bindZustand(counter));
      return adapt(underlyingStore);
    },
    {
      transport: serverTransport,
      name: 'test-worker-main-replace'
    }
  );
  const useClientStore = create(
    () => adapt(createWithZustand(bindZustand(counter))),
    {
      clientTransport,
      name: 'test-worker-main-replace'
    }
  );
  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });

  useServerStore.getState().replaceToSeven();
  await new Promise((resolve) => {
    setTimeout(resolve);
  });

  expect(useServerStore.getState().count).toBe(7);
  expect(underlyingStore!.getState().count).toBe(7);
  expect(useClientStore.getState().count).toBe(7);
  expect(useServerStore.getState().replaceToSeven).toBeInstanceOf(Function);
  expect(useClientStore.getState().replaceToSeven).toBeInstanceOf(Function);
});

test('base direct zustand mutation syncs without forwarding', () => {
  type Counter = {
    count: number;
    increment: () => void;
  };
  const counter: StateCreator<Counter, [], []> = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const underlyingStore = createWithZustand(bindZustand(counter));
  const useStore = create(() => adapt(underlyingStore), {
    name: 'test-base-direct'
  });
  underlyingStore.setState({ count: 3 });
  expect(useStore.getState().count).toBe(3);
});

test('base direct zustand replacement removes stale data keys without copying actions', () => {
  type State = {
    a?: number;
    b?: number;
    replaceA: () => void;
  };
  const external = createWithZustand<State>(
    bindZustand((set) => ({
      a: 1,
      b: 2,
      replaceA() {
        set(
          {
            a: 3
          } as State,
          true
        );
      }
    }))
  );
  const useStore = create(() => adapt(external), {
    name: 'test-zustand-exact-replace'
  });

  external.setState(
    {
      a: 3,
      replaceA: external.getState().replaceA
    } as State,
    true
  );

  expect(useStore.getPureState()).toEqual({
    a: 3
  });
  expect(typeof useStore.getState().replaceA).toBe('function');
  expect(useStore.getPureState().replaceA).toBeUndefined();

  useStore.setState({
    a: 4
  });
  expect(typeof external.getState().replaceA).toBe('function');
});

test('initializer set replace removes stale data keys without deleting actions', () => {
  type State = {
    a?: number;
    b?: number;
    replaceA: () => void;
  };
  const external = createWithZustand<State>(
    bindZustand((set) => ({
      a: 1,
      b: 2,
      replaceA() {
        set(
          {
            a: 3
          } as State,
          true
        );
      }
    }))
  );
  const useStore = create(() => adapt(external), {
    name: 'test-zustand-initializer-replace'
  });

  useStore.getState().replaceA();

  expect(useStore.getPureState()).toEqual({
    a: 3
  });
  expect((external.getState() as any).b).toBeUndefined();
  expect(typeof useStore.getState().replaceA).toBe('function');
  expect(typeof external.getState().replaceA).toBe('function');
});

test('direct zustand mutations refresh signal-backed dependencies', () => {
  type Counter = {
    count: number;
    increment: () => void;
  };
  const counter: StateCreator<Counter, [], []> = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const underlyingStore = createWithZustand(bindZustand(counter));
  const useStore = create(() => adapt(underlyingStore), {
    name: 'test-base-direct-signals'
  });
  const seen: number[] = [];
  const stop = effect(() => {
    seen.push(useStore.getState().count);
  });

  underlyingStore.setState({ count: 4 });
  stop();

  expect(seen).toEqual([0, 4]);
});

test('worker client forbids direct zustand mutations', async () => {
  type Counter = {
    count: number;
    increment: () => void;
  };
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const counter: StateCreator<Counter, [], []> = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const useServerStore = create(
    () => adapt(createWithZustand(bindZustand(counter))),
    {
      transport: serverTransport,
      name: 'test-worker-client-guard'
    }
  );
  useServerStore.getState().increment();
  let clientUnderlyingStore:
    | ReturnType<typeof createWithZustand<Counter>>
    | undefined;
  const useClientStore = create(
    () => {
      const store = createWithZustand(bindZustand(counter));
      clientUnderlyingStore = store;
      return adapt(store);
    },
    {
      name: 'test-worker-client-guard',
      clientTransport
    }
  );
  await new Promise((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });
  expect(useClientStore.getState().count).toBe(1);
  expect(() => {
    clientUnderlyingStore!.setState({ count: 9 });
  }).toThrow('client zustand store cannot be updated');
  expect(clientUnderlyingStore!.getState().count).toBe(1);
  expect(useClientStore.getState().count).toBe(1);
});

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );

  const counter: StateCreator<
    {
      count: number;
      increment: () => void;
    },
    [],
    []
  > = (set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    }
  });
  const useServerStore = create(
    () => adapt(createWithZustand(bindZustand(counter))),
    {
      transport: serverTransport,
      name: 'test'
    }
  );
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
    const useClientStore = create(
      () => adapt(createWithZustand(bindZustand(counter))),
      {
        name: 'test',
        clientTransport
      }
    );

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

describe('Slices', () => {
  test('base - unsupported', () => {
    const counter: StateCreator<
      {
        count: number;
        increment: () => void;
      },
      [],
      []
    > = (set) => ({
      count: 0,
      increment() {
        set((state) => ({ count: state.count + 1 }));
      }
    });
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
          counter: () => adapt(createWithZustand(bindZustand(counter)))
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
        createWithZustand(
          bindZustand((set) => ({
            count: 0,
            increment() {
              set((state) => ({ count: state.count + 1 }));
            }
          }))
        )
      );
    expect(() => {
      create(
        {
          counter
        },
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
