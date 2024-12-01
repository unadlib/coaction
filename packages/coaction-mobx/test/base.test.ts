import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun } from 'mobx';
import { create, type Slices, type Slice } from 'coaction';
import { isDraft } from 'mutative';

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
            set({
              count: this.count + 1
            });
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
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "double": 2,
    "increment": [Function],
  }
  `);
  increment();
  expect(stateFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(getterFn.mock.calls).toMatchInlineSnapshot(`[]`);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 2,
    "double": 4,
    "increment": [Function],
  }
  `);
});

test('mobx', async () => {
  const state = makeAutoObservable({
    value: 0,
    increment() {
      this.value++;
      throw new Error('test');
    }
  });
  autorun(() => {
    // console.log('state', state.value, state.double);
  });
  expect(() => state.increment()).toThrow('test');
  expect(state.value).toBe(1);
});

test('base - error handling', () => {
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
            set((draft) => {
              draft.count += 1;
              throw new Error('test');
            });
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
  expect(() => useStore.getState().increment()).toThrow('test');
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "double": 2,
    "increment": [Function],
  }
  `);
});

test('base enablePatches - error handling', () => {
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
            throw new Error('test');
          }
        })
      ),
    {
      name: 'test',
      enablePatches: true
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
  expect(() => useStore.getState().increment()).toThrow('test');
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "double": 2,
    "increment": [Function],
  }
  `);
  expect(isDraft(useStore.getPureState())).toBeFalsy();
});

test('base enablePatches and async - error handling', async () => {
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
          async increment() {
            this.count += 1;
            await Promise.resolve();
            throw new Error('test');
          }
        })
      ),
    {
      name: 'test',
      enablePatches: true
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
  try {
    await useStore.getState().increment();
  } catch (e) {
    //
  }
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useStore.getState()).toMatchInlineSnapshot(`
  {
    "count": 1,
    "double": 2,
    "increment": [Function],
  }
  `);
  expect(isDraft(useStore.getPureState())).toBeFalsy();
});
