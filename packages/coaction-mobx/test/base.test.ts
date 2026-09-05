import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun, observable, runInAction } from 'mobx';
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

test('subscribe notifies plain listeners on observable changes', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>(
    (set, get, store) =>
      makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      ),
    {
      name: 'test-plain-subscribe'
    }
  );
  const fn = jest.fn();
  const unsubscribe = useStore.subscribe(fn);

  expect(fn).not.toHaveBeenCalled();

  useStore.getState().increment();
  expect(fn).toHaveBeenCalledTimes(1);

  unsubscribe();
  useStore.getState().increment();
  expect(fn).toHaveBeenCalledTimes(1);
});

test('subscribe notifies for symbol keyed observable changes', () => {
  const symbolKey = Symbol('mobx-value');
  const state = observable({
    [symbolKey]: 0
  });
  const useStore = create(() => bindMobx(state) as any);
  const fn = jest.fn();
  const unsubscribe = useStore.subscribe(fn);

  runInAction(() => {
    state[symbolKey] = 1;
  });

  expect((useStore.getState() as any)[symbolKey]).toBe(1);
  expect(fn).toHaveBeenCalledTimes(1);

  unsubscribe();
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

/**
 * The draft, its backup and its finalizer are one transaction, and they are
 * store-global: there is one `internal.rootState`, so there can only be one
 * open at a time. An async action holds its open across every `await`, and a
 * second action entered in that window opens one of its own.
 *
 * The first action then closed, on resume, whatever transaction it found --
 * finalizing the second action's draft while it was still writing through it.
 * mutative revokes a finalized draft's proxy, so the second action failed on
 * its next read with `Cannot perform 'get' on a proxy that has been revoked`:
 * a crash in an action that did nothing wrong, thrown from another action it
 * has never heard of, and only when the two happened to overlap.
 */
test('async actions that overlap do not finalize each other', async () => {
  const gate: Record<string, () => void> = {};
  const useStore = create<{
    total: number;
    log: string[];
    runA: () => Promise<void>;
    runB: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          total: 0,
          log: [] as string[],
          async runA() {
            this.total += 1;
            this.log.push('a1');
            await new Promise<void>((resolve) => {
              gate.a = resolve;
            });
            this.total += 10;
            this.log.push('a2');
          },
          async runB() {
            this.total += 100;
            this.log.push('b1');
            await new Promise<void>((resolve) => {
              gate.b = resolve;
            });
            this.total += 1000;
            this.log.push('b2');
          }
        })
      ),
    { name: 'overlapping-async', enablePatches: true }
  );

  const a = useStore.getState().runA();
  await Promise.resolve();
  // B starts while A is suspended, which is the only way to get two of these
  // in flight at once.
  const b = useStore.getState().runB();
  await Promise.resolve();

  gate.a();
  await expect(a).resolves.toBeUndefined();
  gate.b();
  await expect(b).resolves.toBeUndefined();

  // Every write from both actions is in the state, once each.
  expect(useStore.getState().total).toBe(1111);
  expect(useStore.getState().log).toEqual(['a1', 'b1', 'a2', 'b2']);
  // And no transaction is left open for the next reader to trip over.
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('an overlapping action that throws does not take the others down', async () => {
  const gate: Record<string, () => void> = {};
  const useStore = create<{
    total: number;
    runA: () => Promise<void>;
    runB: () => Promise<void>;
    runC: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          total: 0,
          async runA() {
            this.total += 1;
            await new Promise<void>((resolve) => {
              gate.a = resolve;
            });
            this.total += 10;
          },
          async runB() {
            this.total += 100;
            await new Promise<void>((resolve) => {
              gate.b = resolve;
            });
            throw new Error('b failed');
          },
          async runC() {
            this.total += 1000;
            await new Promise<void>((resolve) => {
              gate.c = resolve;
            });
            this.total += 10000;
          }
        })
      ),
    { name: 'overlapping-async-throwing', enablePatches: true }
  );

  const a = useStore.getState().runA();
  await Promise.resolve();
  const b = useStore.getState().runB();
  await Promise.resolve();
  const c = useStore.getState().runC();
  await Promise.resolve();

  // The one in the middle fails, and finishes first.
  gate.b();
  await expect(b).rejects.toThrow('b failed');
  gate.c();
  await expect(c).resolves.toBeUndefined();
  gate.a();
  await expect(a).resolves.toBeUndefined();

  // B's own write before it threw is kept -- that is what a rejected action
  // does on a mutable instance, which has already been mutated -- and neither
  // of the other two lost anything to it.
  expect(useStore.getState().total).toBe(11111);
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});
