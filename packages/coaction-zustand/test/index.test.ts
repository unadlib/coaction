import { create, Slices } from 'coaction';
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
      workerType: 'WebWorkerInternal',
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
        clientTransport,
        workerType: 'WebWorkerClient'
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
  test.skip('base', () => {
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
    const useStore = create<{
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
        counter: () => adapt(createWithZustand(bindZustand(counter))),
        counter1: () => adapt(createWithZustand(bindZustand(counter)))
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
    "increment": [Function],
  },
  "counter1": {
    "count": 0,
    "increment": [Function],
  },
}
`);
    // const fn = jest.fn();
    // useStore.subscribe(fn);
    useStore.getState().counter.increment();
    //     expect(useStore.getState()).toMatchInlineSnapshot(`
    // {
    //   "counter": {
    //     "count": 1,
    //     "double": 2,
    //     "increment": [Function],
    //   },
    // }
    // `);
    //     increment();
    //     expect(useStore.getState()).toMatchInlineSnapshot(`
    // {
    //   "counter": {
    //     "count": 2,
    //     "double": 4,
    //     "increment": [Function],
    //   },
    // }
    // `);
  });
  //   test('worker', async () => {
  //     const ports = mockPorts();
  //     const serverTransport = createTransport('WebWorkerInternal', ports.main);
  //     const clientTransport = createTransport(
  //       'WebWorkerClient',
  //       ports.create() as WorkerMainTransportOptions
  //     );

  //     const counter: Slices<
  //       {
  //         counter: {
  //           count: number;
  //           increment: () => void;
  //         };
  //       },
  //       'counter'
  //     > = (set) => ({
  //       count: 0,
  //       increment() {
  //         set((draft) => {
  //           draft.counter.count += 1;
  //         });
  //       }
  //     });

  //     const useServerStore = create(
  //       {
  //         counter
  //       },
  //       {
  //         name: 'test',
  //         transport: serverTransport,
  //         workerType: 'WebWorkerInternal'
  //       }
  //     );
  //     const { count, increment } = useServerStore().counter;
  //     expect(count).toBe(0);
  //     expect(increment).toBeInstanceOf(Function);
  //     expect(useServerStore.name).toBe('test');
  //     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  //   {
  //     "count": 0,
  //     "increment": [Function],
  //   }
  //   `);
  //     const fn = jest.fn();
  //     useServerStore.subscribe(fn);
  //     useServerStore.getState().counter.increment();
  //     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  // {
  //   "count": 1,
  //   "increment": [Function],
  // }
  // `);
  //     increment();
  //     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
  // {
  //   "count": 2,
  //   "increment": [Function],
  // }
  // `);
  //     {
  //       const useClientStore = create(
  //         { counter },
  //         {
  //           name: 'test',
  //           clientTransport,
  //           workerType: 'WebWorkerClient'
  //         }
  //       );
  //       await new Promise((resolve) => {
  //         clientTransport.onConnect(() => {
  //           setTimeout(resolve);
  //         });
  //       });
  //       const { count, increment } = useClientStore().counter;
  //       expect(count).toBe(2);
  //       expect(increment).toBeInstanceOf(Function);
  //       expect(useClientStore.name).toBe('test');
  //       expect(useClientStore.getState()).toMatchInlineSnapshot(`
  // {
  //   "counter": {
  //     "count": 2,
  //     "increment": [Function],
  //   },
  // }
  // `);
  //       const fn = jest.fn();
  //       useClientStore.subscribe(fn);
  //       const returnValue0 = useClientStore.getState().counter.increment();
  //       expect(returnValue0 instanceof Promise).toBeTruthy();
  //       await returnValue0;
  //       expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
  // {
  //   "count": 3,
  //   "increment": [Function],
  // }
  // `);
  //       const returnValue1 = increment();
  //       expect(returnValue1 instanceof Promise).toBeTruthy();
  //       await returnValue1;
  //       expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
  // {
  //   "count": 4,
  //   "increment": [Function],
  // }
  // `);
  //     }
  //   });
});
