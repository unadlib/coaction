import { create, effect } from '../index';
import { derivePath } from 'coaction/derived';
import { onStoreCommitValidate, replayStorePatches } from 'coaction/adapter';
import { createStore } from '../src/storeFactory';
import type { ReactivePathNode } from '../src/reactivePath';

const countNodes = (node?: ReactivePathNode): number =>
  node
    ? 1 +
      [...(node.children?.values() ?? [])].reduce(
        (sum, child) => sum + countNodes(child),
        0
      )
    : 0;

test('path reads are lazy, precise, cached and releasable', () => {
  const { store, internal } = createStore({ rows: [{ n: 1 }, { n: 2 }] }, {});
  const first = derivePath(store, ['rows', 0, 'n']);
  expect(internal.reactivePathActiveCount ?? 0).toBe(0);
  const seen: number[] = [];
  const stop = effect(() => {
    seen.push(first());
  });
  expect(internal.reactivePathActiveCount).toBe(1);
  store.setState((s) => {
    s.rows[1].n++;
  });
  expect(seen).toEqual([1]);
  store.setState((s) => {
    s.rows[0].n++;
  });
  expect(seen).toEqual([1, 2]);
  stop();
  expect(first()).toBe(2);
  first.dispose();
  first.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  expect(countNodes(internal.reactivePathRoot)).toBe(1);
  expect(internal.destroyCallbacks!.size).toBe(0);
  expect(() => first()).toThrow('disposed');
  store.destroy();
});

test('paths are copied and track missing parents and structural array changes', () => {
  const store = create({
    rows: [{ n: 1 }, { n: 2 }],
    optional: undefined as { n: number } | undefined
  });
  const path: ['rows', number, 'n'] = ['rows', 1, 'n'];
  const second = derivePath(store, path);
  const missing = derivePath(store, ['optional', 'n']);
  path[1] = 0;
  expect(second()).toBe(2);
  expect(missing()).toBeUndefined();
  store.setState((s) => {
    s.rows.unshift({ n: 4 });
    s.optional = { n: 3 };
  });
  expect(second()).toBe(1);
  expect(missing()).toBe(3);
  store.setState((s) => {
    s.rows.length = 1;
  });
  expect(second()).toBeUndefined();
  store.destroy();
});

test('path results preserve readonly object identity and observe root facades', () => {
  const store = create({ user: { n: 1 } });
  const user = derivePath(store, ['user']);
  const root = derivePath(store, []);
  let notifications = 0;
  const stop = effect(() => {
    root();
    notifications++;
  });
  expect(user()).toBe(store.getState().user);
  expect(() => {
    user().n++;
  }).toThrow('Direct state mutation');
  const before = user();
  store.setState((s) => {
    s.user.n++;
  });
  expect(user()).toBe(store.getState().user);
  expect(before.n).toBe(1);
  expect(notifications).toBe(2);
  stop();
  store.destroy();
  expect(() => user()).toThrow('disposed');
  expect(() => root()).toThrow('disposed');
});

test('draft reads and rollback never replace committed caches or notify effects', () => {
  const { store, internal } = createStore({ user: { n: 1 } }, {});
  const n = derivePath(store, ['user', 'n']);
  const user = derivePath(store, ['user']);
  const seen: number[] = [];
  const stop = effect(() => {
    seen.push(n());
  });
  const before = user();
  const dependencies = internal.reactivePathActiveCount;
  expect(() =>
    store.setState((s) => {
      s.user.n = 9;
      expect(n()).toBe(9);
      expect(user().n).toBe(9);
      expect(seen).toEqual([1]);
      throw new Error('rollback');
    })
  ).toThrow('rollback');
  expect(n()).toBe(1);
  expect(user()).toBe(before);
  expect(internal.reactivePathActiveCount).toBe(dependencies);
  const veto = onStoreCommitValidate(store, () => {
    throw new Error('veto');
  });
  expect(() =>
    store.setState((s) => {
      s.user.n = 5;
      expect(n()).toBe(5);
    })
  ).toThrow('veto');
  expect(n()).toBe(1);
  expect(seen).toEqual([1]);
  veto();
  store.setState((s) => {
    s.user.n = 3;
    expect(n()).toBe(3);
  });
  expect(n()).toBe(3);
  expect(seen).toEqual([1, 3]);
  stop();
  store.destroy();
});

test.each(['object', 'recipe', 'apply', 'replay', 'root'] as const)(
  'path reads follow %s commits',
  (kind) => {
    const store = create({ user: { n: 1 } });
    const n = derivePath(store, ['user', 'n']);
    expect(n()).toBe(1);
    const patches = [{ op: 'replace' as const, path: ['user', 'n'], value: 2 }];
    if (kind === 'object') store.setState({ user: { n: 2 } });
    else if (kind === 'recipe')
      store.setState((s) => {
        s.user.n = 2;
      });
    else if (kind === 'root') store.apply({ user: { n: 2 } });
    else if (kind === 'apply') store.apply(store.getPureState(), patches);
    else
      replayStorePatches(store, {
        patches,
        inversePatches: [{ ...patches[0], value: 1 }]
      });
    expect(n()).toBe(2);
    store.destroy();
  }
);

test('path reads retain symbols, sparse holes and atomic leaves', () => {
  const key = Symbol('key');
  const date = new Date(0);
  const store = create({
    dict: { [key]: 1 },
    sparse: new Array<number>(2),
    date
  });
  const symbol = derivePath(store, ['dict', key]);
  const length = derivePath(store, ['sparse', 'length']);
  const hole = derivePath(store, ['sparse', 1]);
  const atom = derivePath(store, ['date']);
  expect(symbol()).toBe(1);
  expect(length()).toBe(2);
  expect(hole()).toBeUndefined();
  expect(atom()).toBe(date);
  store.setState({ dict: { [key]: 2 }, sparse: [3, 4], date: new Date(1) });
  expect(symbol()).toBe(2);
  expect(hole()).toBe(4);
  expect(atom()).toBe(store.getState().date);
  store.destroy();
});

test('path reads use Object.is for NaN and signed zero propagation', () => {
  const store = create({ n: 0 });
  const n = derivePath(store, ['n']);
  const values: number[] = [];
  const stop = effect(() => {
    values.push(n());
  });
  for (const value of [-0, NaN, NaN, 1]) store.setState({ n: value });
  expect(values).toEqual([0, -0, NaN, 1]);
  stop();
  store.destroy();
});

test('unsupported stores and non-data paths fail explicitly', () => {
  expect(() => derivePath({ getState: () => ({ n: 0 }) }, ['n'])).toThrow(
    'native immutable'
  );
  const store = create<{ n: number; readonly doubled: number }>({
    n: 0,
    get doubled() {
      return this.n * 2;
    }
  });
  const doubled = derivePath(store, ['doubled']);
  expect(() => doubled()).toThrow('state data');
  expect(() => doubled()).toThrow('state data');
  store.destroy();
  expect(() => derivePath(store, ['n'])).toThrow('store.destroy');
});

test('store destruction disposes unread derived values too', () => {
  const { store, internal } = createStore({ n: 1 }, {});
  const n = derivePath(store, ['n']);
  expect(internal.destroyCallbacks!.size).toBe(1);
  store.destroy();
  expect(() => n()).toThrow('disposed');
  expect(internal.reactivePathActiveCount ?? 0).toBe(0);
  expect(internal.destroyCallbacks!.size).toBe(0);
});
