import { makeAutoObservable, autorun } from 'mobx';
import { createTransport, mockPorts } from 'data-transport';
import { createWithMobx as create } from '../src';

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WorkerInternal', ports.main);
  const clientTransport = createTransport('WorkerMain', ports.create());

  const counter = () =>
    makeAutoObservable({
      name: 'test',
      count: 0,
      increment() {
        this.count += 1;
      }
    });
  const useServerStore = create(counter, {
    transport: serverTransport,
    workerType: 'WorkerInternal'
  });
  // TODO: fix this
  // @ts-ignore
  const { count, increment, name } = useServerStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe('WorkerInternal');
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "name": "WorkerInternal",
}
`);
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "WorkerInternal",
}
`);
  increment.call(useServerStore.getState());
  expect(useServerStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "WorkerInternal",
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
    expect(name).toBe('WorkerInternal');
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 2,
    "increment": [Function],
    "name": "WorkerInternal",
  }
  `);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    useClientStore.getState().increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 3,
    "increment": [Function],
    "name": "WorkerInternal",
  }
  `);
    increment();
    expect(useClientStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 4,
    "increment": [Function],
    "name": "WorkerInternal",
  }
  `);
  }
});

test('base', () => {
  const useStore = create(() =>
    makeAutoObservable({
      name: 'test',
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );
  // TODO: fix this
  // @ts-ignore
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
  useStore.subscribe(() => {
    fn(useStore.getState().count);
  });
  // // @ts-ignore
  useStore.getState().increment();
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "test",
}
`);
  expect(fn).toHaveBeenCalledTimes(2);
  // useStore.getState().increment();
  increment.call(useStore.getState());
  expect(useStore.getState()).toMatchInlineSnapshot(`
{
  "count": 2,
  "increment": [Function],
  "name": "test",
}
`);
  expect(fn).toHaveBeenCalledTimes(3);
});

describe('Slices', () => {
  test('base', () => {
    const useStore = create({
      counter: () =>
        makeAutoObservable({
          name: 'test',
          count: 0,
          increment() {
            this.count += 1;
          }
        })
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
  }
  `);
    // TODO: fix this
    increment.call(useStore.getState().counter);
    expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "counter": {
      "count": 2,
      "increment": [Function],
      "name": "test",
    },
  }
  `);
  });
  test('worker', async () => {
    const ports = mockPorts();
    const serverTransport = createTransport('WorkerInternal', ports.main);
    const clientTransport = createTransport('WorkerMain', ports.create());

    const counter = () =>
      makeAutoObservable({
        name: 'test',
        count: 0,
        increment() {
          this.count += 1;
        }
      });
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
