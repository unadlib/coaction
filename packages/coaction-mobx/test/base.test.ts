import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { bindMobx } from '../src';
import { makeAutoObservable, autorun, observable, runInAction } from 'mobx';
import { create, type Slices, type Slice, type Store } from 'coaction';
import {
  onStoreCommit,
  onStoreCommitValidate,
  type StoreCommit
} from 'coaction/adapter';
import { apply as applyPatches } from 'mutative';
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

/**
 * Nesting and overlapping are the two ways more than one action can want the
 * single draft slot at once, and they need opposite things on the way out.
 *
 * A nested action's caller is still on the stack and still writing, so it has
 * to be handed a fresh transaction. An action suspended at an `await` is not
 * running at all -- but it is still going to write again, and a write with no
 * transaction open goes straight to the MobX instance. The state comes out
 * right and the patch stream is missing it, which is the failure that looks
 * like no failure at all.
 *
 * These cover every mixture of the two, and they check the patch stream rather
 * than the state, because the state was never the part that broke.
 */
const track = (store: {
  subscribe: (fn: () => void) => void;
  getPureState: () => unknown;
}) => {
  const commits: StoreCommit[] = [];
  const states: unknown[] = [];
  const initial = clone(store.getPureState());
  onStoreCommit(store as Store<any>, (commit) => commits.push(commit));
  store.subscribe(() => states.push(clone(store.getPureState())));
  return {
    commits,
    states,
    /**
     * Replay every commit from the state the store started in.
     *
     * `subscribe` sees the state after each notification, which is what the
     * application sees and what a wrong test would check. This is what
     * `@coaction/history`, `@coaction/sync` and any future devtool see, and
     * the two agreeing is the invariant: a write missing from the patch
     * stream is invisible to all of them and to nothing else.
     */
    replayed: () =>
      commits.reduce(
        (state, commit) => applyPatches(state, commit.patches),
        initial as object
      )
  };
};

const clone = (value: unknown) => JSON.parse(JSON.stringify(value));

test('a nested action hands the transaction back to its caller', () => {
  const useStore = create<{
    a: number;
    b: number;
    inner: () => void;
    outer: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          a: 0,
          b: 0,
          inner() {
            this.b += 1;
          },
          outer() {
            this.a += 1;
            this.inner();
            this.a += 1;
          }
        })
      ),
    { name: 'nested-sync', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  useStore.getState().outer();

  expect(useStore.getState().a).toBe(2);
  expect(useStore.getState().b).toBe(1);
  // The write after the nested call is committed, not just applied to the
  // instance: three commits, and the last one carries it.
  expect(states).toEqual([
    { a: 1, b: 0 },
    { a: 1, b: 1 },
    { a: 2, b: 1 }
  ]);
  expect(replayed()).toEqual({ a: 2, b: 1 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('nesting two deep still commits every write', () => {
  const useStore = create<{
    n: number;
    innermost: () => void;
    middle: () => void;
    outer: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          innermost() {
            this.n += 100;
          },
          middle() {
            this.n += 10;
            this.innermost();
            this.n += 10;
          },
          outer() {
            this.n += 1;
            this.middle();
            this.n += 1;
          }
        })
      ),
    { name: 'nested-deep', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  useStore.getState().outer();

  expect(useStore.getState().n).toBe(122);
  expect(states[states.length - 1]).toEqual({ n: 122 });
  expect(replayed()).toEqual({ n: 122 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('a nested action that throws leaves the caller able to finish', () => {
  const useStore = create<{
    n: number;
    inner: () => void;
    outer: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          inner() {
            this.n += 10;
            throw new Error('inner failed');
          },
          outer() {
            this.n += 1;
            try {
              this.inner();
            } catch {
              // the caller handles it and carries on
            }
            this.n += 1;
          }
        })
      ),
    { name: 'nested-throwing', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  useStore.getState().outer();

  expect(useStore.getState().n).toBe(12);
  expect(states[states.length - 1]).toEqual({ n: 12 });
  expect(replayed()).toEqual({ n: 12 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('an async action calls a nested one after its await', async () => {
  const useStore = create<{
    n: number;
    inner: () => void;
    outer: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          inner() {
            this.n += 10;
          },
          async outer() {
            this.n += 1;
            await Promise.resolve();
            this.inner();
            this.n += 1;
          }
        })
      ),
    { name: 'nested-after-await', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  await useStore.getState().outer();

  expect(useStore.getState().n).toBe(12);
  expect(states[states.length - 1]).toEqual({ n: 12 });
  expect(replayed()).toEqual({ n: 12 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('a sync action calls an async one and does not wait for it', async () => {
  const useStore = create<{
    n: number;
    inner: () => Promise<void>;
    outer: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          async inner() {
            this.n += 10;
            await Promise.resolve();
            this.n += 10;
          },
          outer() {
            this.n += 1;
            const pending = this.inner();
            // The caller goes on writing while the nested action is suspended.
            this.n += 1;
            return pending;
          }
        })
      ),
    { name: 'nested-async-inner', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  await useStore.getState().outer();
  await Promise.resolve();

  expect(useStore.getState().n).toBe(22);
  expect(states[states.length - 1]).toEqual({ n: 22 });
  expect(replayed()).toEqual({ n: 22 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('a nested pair runs while an unrelated async action is suspended', async () => {
  let release: (() => void) | undefined;
  const useStore = create<{
    n: number;
    suspended: () => Promise<void>;
    inner: () => void;
    outer: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          async suspended() {
            this.n += 1;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            this.n += 10;
          },
          inner() {
            this.n += 100;
          },
          outer() {
            this.n += 1000;
            this.inner();
            this.n += 1000;
          }
        })
      ),
    { name: 'nested-during-async', enablePatches: true }
  );
  const { states, replayed } = track(useStore);

  const pending = useStore.getState().suspended();
  await Promise.resolve();
  useStore.getState().outer();
  release!();
  await expect(pending).resolves.toBeUndefined();

  expect(useStore.getState().n).toBe(2111);
  expect(states[states.length - 1]).toEqual({ n: 2111 });
  expect(replayed()).toEqual({ n: 2111 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

/**
 * The failure that looks like no failure at all.
 *
 * An async action suspended at an `await` loses its transaction to whatever
 * runs next. When that is a second action which finishes completely, nothing
 * held a transaction by the time the first one resumed, so its remaining writes
 * went straight to the MobX instance. The instance is the state, so
 * `getState()`, `subscribe()` and the rendered UI were all correct -- and the
 * patch stream was missing a write, which is what `@coaction/history`,
 * `@coaction/sync` and anything else reading commits are built on.
 *
 * Replaying the commits is the check. Asserting on the state cannot see it.
 */
test('a write after an await reaches the patch stream, not only the instance', async () => {
  let release: (() => void) | undefined;
  const useStore = create<{
    n: number;
    suspended: () => Promise<void>;
    interrupt: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          async suspended() {
            this.n += 1;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            this.n += 10;
          },
          interrupt() {
            this.n += 100;
          }
        })
      ),
    { name: 'commit-hole', enablePatches: true }
  );
  const { replayed } = track(useStore);

  const pending = useStore.getState().suspended();
  await Promise.resolve();
  // Runs and finishes entirely inside the first action's await.
  useStore.getState().interrupt();
  release!();
  await expect(pending).resolves.toBeUndefined();

  expect(useStore.getState().n).toBe(111);
  // Without the hand-back this was 101: the state was right and the `+10` had
  // never been committed.
  expect(replayed()).toEqual({ n: 111 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

test('two async actions interrupted by a third still replay to the state', async () => {
  const gate: Record<string, () => void> = {};
  const useStore = create<{
    n: number;
    first: () => Promise<void>;
    second: () => Promise<void>;
    interrupt: () => void;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          async first() {
            this.n += 1;
            await new Promise<void>((resolve) => {
              gate.first = resolve;
            });
            this.n += 10;
          },
          async second() {
            this.n += 100;
            await new Promise<void>((resolve) => {
              gate.second = resolve;
            });
            this.n += 1000;
          },
          interrupt() {
            this.n += 10000;
          }
        })
      ),
    { name: 'commit-hole-three', enablePatches: true }
  );
  const { replayed } = track(useStore);

  const a = useStore.getState().first();
  await Promise.resolve();
  const b = useStore.getState().second();
  await Promise.resolve();
  useStore.getState().interrupt();
  gate.first();
  await expect(a).resolves.toBeUndefined();
  gate.second();
  await expect(b).resolves.toBeUndefined();

  expect(useStore.getState().n).toBe(11111);
  expect(replayed()).toEqual({ n: 11111 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

/**
 * A mutable instance was treated as having no pre-commit point at all, and
 * that is only true of mutation made on the object directly. An action goes
 * through Coaction: it writes into a draft, and `store.apply` is what puts the
 * change onto the instance. There is a moment between those, and a validator
 * that throws in it leaves the instance holding exactly what it held before.
 *
 * Until this, a validator was not merely late for these stores -- an adapter
 * replaces `store.apply`, so the check at the core commit point was never
 * reached and the validator did not run at all.
 */
test('a commit validator can refuse an action on a mutable instance', () => {
  let instance: { n: number; when: string } | undefined;
  const useStore = create<{
    n: number;
    when: string;
    ok: () => void;
    bad: () => void;
  }>(
    () => {
      instance = makeAutoObservable(
        bindMobx({
          n: 0,
          when: '1970-01-01',
          ok() {
            this.n += 1;
          },
          bad() {
            this.n += 1;
            (this as { when: unknown }).when = new Date(0);
          }
        })
      );
      return instance as never;
    },
    { name: 'mutable-validator', enablePatches: true }
  );
  const commits: StoreCommit[] = [];
  onStoreCommit(useStore as Store<any>, (commit) => commits.push(commit));
  onStoreCommitValidate(useStore as Store<any>, (commit) => {
    for (const patch of commit.patches) {
      if ('value' in patch && patch.value instanceof Date) {
        throw new TypeError('no Dates');
      }
    }
  });

  useStore.getState().ok();
  expect(commits.map(({ source }) => source)).toEqual(['mutableAction']);

  expect(() => useStore.getState().bad()).toThrow('no Dates');
  // The instance is what the application reads, and it never saw the refused
  // transition -- including the legal write that shared it.
  expect(instance!.n).toBe(1);
  expect(instance!.when).toBe('1970-01-01');
  expect(useStore.getState().n).toBe(1);
  expect(commits).toHaveLength(1);
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});

/**
 * Ownership of the draft is a stack, not a pair.
 *
 * Three async actions in flight leave a chain: each took the transaction from
 * the one before it. Released out of order, the one that finishes last can find
 * the action it displaced already finished, while something further down the
 * chain is still waiting to write. Handing the transaction only to the
 * immediate predecessor dropped it there, and the still-waiting action's write
 * after its `await` went straight to the MobX instance with no draft to record
 * it -- the state came out right and the patch stream was missing it.
 */
test('a transaction reaches the nearest action still waiting for it', async () => {
  const gates = new Map<string, () => void>();
  const wait = (id: string) =>
    new Promise<void>((resolve) => {
      gates.set(id, resolve);
    });
  const useStore = create<{
    n: number;
    first: () => Promise<void>;
    second: () => Promise<void>;
    third: () => Promise<void>;
  }>(
    () =>
      makeAutoObservable(
        bindMobx({
          n: 0,
          async first() {
            this.n += 1;
            await wait('first');
            this.n += 1;
          },
          async second() {
            this.n += 10;
            await wait('second');
            this.n += 10;
          },
          async third() {
            this.n += 100;
            await wait('third');
            this.n += 100;
          }
        })
      ),
    { name: 'ownership-chain', enablePatches: true }
  );
  const { replayed } = track(useStore);

  const first = useStore.getState().first();
  await Promise.resolve();
  const second = useStore.getState().second();
  await Promise.resolve();
  const third = useStore.getState().third();
  await Promise.resolve();

  // The middle one finishes first, then the last, then the first -- so the
  // action that finishes last is holding a transaction owed to one that is two
  // places down the chain.
  for (const id of ['second', 'third', 'first']) {
    gates.get(id)!();
    for (let drain = 0; drain < 6; drain += 1) await Promise.resolve();
  }
  await Promise.all([first, second, third]);

  expect(useStore.getState().n).toBe(222);
  expect(replayed()).toEqual({ n: 222 });
  expect(isDraft(useStore.getPureState())).toBeFalsy();
  useStore.destroy();
});
