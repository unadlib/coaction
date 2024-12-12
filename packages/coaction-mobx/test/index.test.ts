import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun } from 'mobx';
import { create, type Slices, type Slice } from 'coaction';

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
    transport: serverTransport,
    workerType: 'WebWorkerInternal'
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
  useServerStore.subscribe(() => {
    fn(useServerStore.getState().count);
  });
  expect(fn).toHaveBeenCalledTimes(1);
  await useServerStore.getState().increment();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
}
`);
  await increment();
  expect(fn).toHaveBeenCalledTimes(3);
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 4,
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
  test('base', () => {
    const stateFn = jest.fn();
    const getterFn = jest.fn();
    const useStore = create(
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
    > = () =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      );
    const useServerStore = create(
      { counter },
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
      useClientStore.getState().counter.increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 3,
  "increment": [Function],
}
`);
      increment();
      expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
{
  "count": 4,
  "increment": [Function],
}
`);
    }
  });
});
