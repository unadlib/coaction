import {
  defineStore as defineStoreWithPinia,
  createPinia,
  setActivePinia
} from 'pinia';
import { createTransport, mockPorts } from 'data-transport';
import { createWithPinia as create, defineStore } from '../src';

test('pinia', () => {
  const useCounterStore = defineStoreWithPinia('counter', {
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

test('worker', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WorkerInternal', ports.main);
  const clientTransport = createTransport('WorkerMain', ports.create());

  const counter = () =>
    defineStore('counter', {
      state: () => ({
        count: 0
      }),
      getters: {
        // @ts-ignore
        doubleCount: (state) => state.count * 2
      },
      actions: {
        // since we rely on `this`, we cannot use an arrow function
        increment() {
          // @ts-ignore
          this.count++;
        }
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
  const fn = jest.fn();
  useServerStore.subscribe(fn);
  useServerStore.getState().increment();
  increment.call(useServerStore.getState());
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
    // TODO: fix this
    expect(name).toBe(undefined);
    const fn = jest.fn();
    useClientStore.subscribe(fn);
    await useClientStore.getState().increment();
    expect(useClientStore().count).toBe(3);
    await increment();
    expect(useClientStore().count).toBe(4);
  }
});

test('base', () => {
  const counter = () =>
    defineStore('counter', {
      state: () => ({
        count: 0
      }),
      getters: {
        // @ts-ignore
        doubleCount: (state) => state.count * 2
      },
      actions: {
        // since we rely on `this`, we cannot use an arrow function
        increment() {
          // @ts-ignore
          this.count++;
        }
      }
    });
  const useStore = create(counter);
  // TODO: fix this
  // @ts-ignore
  const { count, increment, name } = useStore();
  expect(count).toBe(0);
  expect(increment).toBeInstanceOf(Function);
  expect(name).toBe(undefined);
  expect(useStore.getState().count).toBe(0);
  const fn = jest.fn();
  useStore.subscribe(() => {
    fn(useStore.getState().count);
  });
  // // @ts-ignore
  useStore.getState().increment();
  expect(useStore.getState().count).toBe(1);
  // TODO: fix this
  // expect(fn).toHaveBeenCalledTimes(2);
  increment.call(useStore.getState());
  expect(useStore.getState().count).toBe(2);
  // expect(fn).toHaveBeenCalledTimes(3);
});

// describe.only('Slices', () => {
//   test('base', () => {
//     const useStore = create({
//       counter: () =>
//         makeAutoObservable({
//           name: 'test',
//           count: 0,
//           increment() {
//             this.count += 1;
//           }
//         })
//     });
//     // TODO: fix this
//     // @ts-ignore
//     const { count, increment, name } = useStore().counter;
//     expect(count).toBe(0);
//     expect(increment).toBeInstanceOf(Function);
//     expect(name).toBe('test');
//     expect(useStore.getState()).toMatchInlineSnapshot(`
//   {
//     "counter": {
//       "count": 0,
//       "increment": [Function],
//       "name": "test",
//     },
//   }
//   `);
//     const fn = jest.fn();
//     useStore.subscribe(fn);
//     // @ts-ignore
//     useStore.getState().counter.increment();
//     expect(useStore.getState()).toMatchInlineSnapshot(`
//   {
//     "counter": {
//       "count": 1,
//       "increment": [Function],
//       "name": "test",
//     },
//   }
//   `);
//     // TODO: fix this
//     increment.call(useStore.getState().counter);
//     expect(useStore.getState()).toMatchInlineSnapshot(`
//   {
//     "counter": {
//       "count": 2,
//       "increment": [Function],
//       "name": "test",
//     },
//   }
//   `);
//   });
//   test('worker', async () => {
//     const ports = mockPorts();
//     const serverTransport = createTransport('WorkerInternal', ports.main);
//     const clientTransport = createTransport('WorkerMain', ports.create());

//     const counter = () =>
//       makeAutoObservable({
//         name: 'test',
//         count: 0,
//         increment() {
//           this.count += 1;
//         }
//       });
//     const useServerStore = create(
//       { counter },
//       {
//         transport: serverTransport,
//         workerType: 'WorkerInternal'
//       }
//     );
//     // TODO: fix this
//     // @ts-ignore
//     const { count, increment, name } = useServerStore().counter;
//     expect(count).toBe(0);
//     expect(increment).toBeInstanceOf(Function);
//     expect(name).toBe('test');
//     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
//   {
//     "count": 0,
//     "increment": [Function],
//     "name": "test",
//   }
//   `);
//     const fn = jest.fn();
//     useServerStore.subscribe(fn);
//     useServerStore.getState().counter.increment();
//     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
// {
//   "count": 1,
//   "increment": [Function],
//   "name": "test",
// }
// `);
//     increment();
//     expect(useServerStore.getState().counter).toMatchInlineSnapshot(`
// {
//   "count": 2,
//   "increment": [Function],
//   "name": "test",
// }
// `);
//     {
//       const useClientStore = create({ counter })({
//         transport: clientTransport,
//         workerType: 'WorkerMain'
//       });
//       await new Promise((resolve) => {
//         clientTransport.onConnect(() => {
//           setTimeout(resolve);
//         });
//       });

//       // @ts-ignore
//       const { count, increment, name } = useClientStore().counter;
//       expect(count).toBe(2);
//       expect(increment).toBeInstanceOf(Function);
//       expect(name).toBe('test');
//       expect(useClientStore.getState()).toMatchInlineSnapshot(`
// {
//   "counter": {
//     "count": 2,
//     "increment": [Function],
//     "name": "test",
//   },
//   "name": "WorkerInternal",
// }
// `);
//       const fn = jest.fn();
//       useClientStore.subscribe(fn);
//       useClientStore.getState().counter.increment();
//       expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
// {
//   "count": 3,
//   "increment": [Function],
//   "name": "test",
// }
// `);
//       increment();
//       expect(useClientStore.getState().counter).toMatchInlineSnapshot(`
// {
//   "count": 4,
//   "increment": [Function],
//   "name": "test",
// }
// `);
//     }
//   });
// });
