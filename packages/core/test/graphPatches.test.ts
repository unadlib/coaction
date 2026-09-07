import { create } from '../index';
import {
  applyPatches,
  onStoreCommit,
  onStoreCommitPrepare,
  replayStorePatches,
  type StoreCommit
} from 'coaction/adapter';
import { isSameStructure } from '../src/utils';
import { history, type HistoryApi } from '@coaction/history';

const cycle = () => {
  const value: Record<string, unknown> = {};
  value.self = value;
  return value;
};

test('structure comparison respects atomic values, prototypes and sparse length', () => {
  class Value {}
  for (const [left, right] of [
    [new Date(0), new Date(1)],
    [new Map(), new Map()],
    [new Set(), new Set()],
    [/a/, /b/],
    [new Value(), new Value()],
    [[], Array(1)],
    [Array(1), [undefined]],
    [{}, Object.create(null)]
  ]) {
    expect(isSameStructure(left, right)).toBe(false);
    expect(isSameStructure(left, left)).toBe(true);
  }
});

test('structure comparison preserves cycles and bijective reference topology', () => {
  expect(isSameStructure(Object.create(null), Object.create(null))).toBe(true);
  expect(isSameStructure(cycle(), cycle())).toBe(true);
  const shared = {};
  const aliased = { a: shared, b: shared };
  const separate = { a: {}, b: {} };
  expect(isSameStructure(aliased, separate)).toBe(false);
  expect(isSameStructure(separate, aliased)).toBe(false);
  const stable = { shared };
  expect(isSameStructure({ stable, a: shared }, { stable, a: {} })).toBe(false);
  const one = cycle();
  const two: Record<string, unknown> = { self: cycle() };
  expect(isSameStructure(one, two)).toBe(false);
});

test('null-prototype records are drafted and replayed without mutating the base', () => {
  const store = create((set) => ({
    record: Object.assign(Object.create(null), { value: 0 }),
    bump() {
      set(() => {
        this.record.value += 1;
      });
    }
  }));
  const before = store.getPureState();
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => commits.push(commit));
  store.getState().bump();
  expect(before.record.value).toBe(0);
  expect(commits).toHaveLength(1);
  const replayed = applyPatches(before, commits[0].patches);
  expect(Object.getPrototypeOf(replayed.record)).toBe(null);
  expect(replayed.record.value).toBe(1);
  expect(applyPatches(replayed, commits[0].inversePatches).record.value).toBe(
    0
  );
  store.destroy();
});

test.each(['listener', 'prepare'] as const)(
  '%s preserves aliases to another root field and both replay directions',
  (mode) => {
    const store = create((set) => ({
      left: { value: 0 },
      right: { value: 1 },
      link() {
        set(() => {
          this.left = this.right;
        });
      }
    }));
    const commits: StoreCommit[] = [];
    onStoreCommit(store, (commit) => commits.push(commit));
    if (mode === 'prepare') onStoreCommitPrepare(store, () => true);
    const before = store.getPureState();
    store.getState().link();
    const after = store.getPureState();
    expect(after.left).toBe(after.right);
    expect(commits).toHaveLength(1);
    const replayed = applyPatches(before, commits[0].patches);
    expect(replayed.left).toBe(replayed.right);
    const restored = applyPatches(after, commits[0].inversePatches);
    expect(restored.left).not.toBe(restored.right);
    expect(restored).toEqual(before);
    replayStorePatches(store, {
      patches: commits[0].inversePatches,
      inversePatches: commits[0].patches
    });
    expect(store.getPureState().left).not.toBe(store.getPureState().right);
    store.destroy();
  }
);

test.each([
  'alias',
  'cycle',
  'sparse',
  'symbol',
  'date',
  'map',
  'set',
  'regexp',
  'instance'
] as const)(
  'positional fallback preserves %s values through commit and replay',
  (kind) => {
    const token = Symbol('token');
    const shared = { value: 1 };
    class AtomicValue {}
    const values = {
      alias: { a: shared, b: shared },
      cycle: cycle(),
      sparse: Array(3),
      symbol: { [token]: shared },
      date: new Date(123),
      map: new Map(),
      set: new Set(),
      regexp: /value/,
      instance: new AtomicValue()
    };
    const value = values[kind];
    const collect = (node: any, found: any[][] = []): any[][] => {
      if (Array.isArray(node)) found.push(node);
      if (node && typeof node === 'object') {
        for (const key of Object.keys(node)) collect(node[key], found);
      }
      return found;
    };
    const store = create<{
      rows: any[];
      graph: any;
      move: () => void;
    }>((set) => ({
      rows: [false, [-1, 0, '', true], { a: -1 }, [0, '', 1.5, '']],
      graph: null,
      move() {
        set(() => {
          collect(this.rows);
          this.rows.unshift('moved');
          const moved = collect(this.rows).find(
            (row) => row.length === 4 && row[0] === -1
          );
          if (moved) moved.length = 3;
          this.graph = value;
        });
      }
    }));
    const commits: StoreCommit[] = [];
    onStoreCommit(store, (commit) => commits.push(commit));
    const before = store.getPureState();
    store.getState().move();
    expect(commits).toHaveLength(1);
    for (const state of [
      store.getPureState(),
      applyPatches(before, commits[0].patches)
    ]) {
      const graph = state.graph;
      if (kind === 'alias') expect(graph.a).toBe(graph.b);
      if (kind === 'cycle') expect(graph.self).toBe(graph);
      if (kind === 'sparse') {
        expect(graph.length).toBe(3);
        expect(0 in graph).toBe(false);
      }
      if (kind === 'symbol') expect(graph[token]).toEqual(shared);
      if (['date', 'map', 'set', 'regexp', 'instance'].includes(kind))
        expect(graph).toBe(value);
      expect(state.rows).toEqual([
        'moved',
        false,
        [-1, 0, ''],
        { a: -1 },
        [0, '', 1.5, '']
      ]);
    }
    expect(
      applyPatches(store.getPureState(), commits[0].inversePatches)
    ).toEqual(before);
    store.destroy();
  }
);

test('updating a sibling preserves an untouched cyclic value and runs once', () => {
  const store = create((set) => ({
    graph: cycle(),
    count: 0,
    bump() {
      set(() => {
        calls += 1;
        this.count += 1;
      });
    }
  }));
  let calls = 0;
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => commits.push(commit));
  store.getState().bump();
  expect(calls).toBe(1);
  expect(store.getPureState().graph.self).toBe(store.getPureState().graph);
  const restored = applyPatches(
    store.getPureState(),
    commits[0].inversePatches
  );
  expect(restored.count).toBe(0);
  expect(restored.graph.self).toBe(restored.graph);
  store.destroy();
});

const observationModes = [
  'unwatched',
  'listener',
  'prepare',
  'getter',
  'history'
] as const;

test.each(observationModes)(
  '%s preserves complete graph replacements, executes once and rolls back recipe errors',
  (mode) => {
    let calls = 0;
    const store = create(
      () => ({
        left: null as any,
        right: null as any,
        get linked() {
          return (
            this.left !== null &&
            this.left === this.right &&
            this.left.self === this.left
          );
        }
      }),
      { middlewares: mode === 'history' ? [history()] : [] }
    );
    const commits: StoreCommit[] = [];
    if (mode === 'listener' || mode === 'history') {
      onStoreCommit(store, (commit) => commits.push(commit));
    }
    if (mode === 'prepare') {
      onStoreCommitPrepare(store, (commit) => {
        commits.push(commit);
        return true;
      });
    }
    if (mode === 'getter') expect(store.getState().linked).toBe(false);
    const before = store.getPureState();
    // These are complete ordinary objects, not links back into a live draft.
    const next = cycle();
    const failure = new Error('application recipe failed');
    expect(() =>
      store.setState((draft) => {
        calls += 1;
        draft.left = next;
        draft.right = next;
        throw failure;
      })
    ).toThrow(failure);
    expect(calls).toBe(1);
    expect(store.getPureState()).toBe(before);
    expect(commits).toHaveLength(0);
    const api = (store as unknown as { history: HistoryApi<object> }).history;
    if (mode === 'history') expect(api.undo()).toBe(false);

    store.setState((draft) => {
      calls += 1;
      draft.left = next;
      draft.right = next;
    });
    expect(calls).toBe(2);
    const assertLinked = (state: any) => {
      expect(state.left).toBe(state.right);
      expect(state.left.self).toBe(state.left);
    };
    assertLinked(store.getPureState());
    expect(store.getState().linked).toBe(true);
    expect(before.left).toBe(null);
    expect(before.right).toBe(null);
    if (mode === 'listener' || mode === 'prepare' || mode === 'history') {
      expect(commits).toHaveLength(1);
      const commit = commits[0];
      assertLinked(applyPatches(before, commit.patches));
      const restored = applyPatches(
        store.getPureState(),
        commit.inversePatches
      );
      expect(restored.left).toBe(null);
      expect(restored.right).toBe(null);
    }
    if (mode === 'history') {
      expect(api.undo()).toBe(true);
      expect(store.getPureState().left).toBe(null);
      expect(store.getPureState().right).toBe(null);
      expect(api.redo()).toBe(true);
      assertLinked(store.getPureState());
    }
    store.destroy();
  }
);

test.each([false, true])(
  'DAG edits follow independent draft paths and preserve explicit relinking (watched: %s)',
  (watched) => {
    const shared = { value: 0 };
    const store = create(() => ({ left: shared, right: shared }));
    const commits: StoreCommit[] = [];
    if (watched) onStoreCommit(store, (commit) => commits.push(commit));
    const before = store.getPureState();
    store.setState((draft) => {
      draft.left.value = 1;
    });
    const split = store.getPureState();
    expect(split.left.value).toBe(1);
    expect(split.right.value).toBe(0);
    expect(split.left).not.toBe(split.right);
    expect(before.left).toBe(before.right);
    expect(before.left.value).toBe(0);
    store.setState((draft) => {
      draft.right = draft.left;
    });
    const linked = store.getPureState();
    expect(linked.left).toBe(linked.right);
    expect(linked.right.value).toBe(1);
    if (watched) {
      expect(commits).toHaveLength(2);
      const replayedSplit = applyPatches(before, commits[0].patches);
      expect(replayedSplit.left).not.toBe(replayedSplit.right);
      expect(replayedSplit).toEqual(split);
      const replayedLink = applyPatches(replayedSplit, commits[1].patches);
      expect(replayedLink.left).toBe(replayedLink.right);
      const restoredSplit = applyPatches(linked, commits[1].inversePatches);
      expect(restoredSplit.left).not.toBe(restoredSplit.right);
      expect(restoredSplit).toEqual(split);
      const restored = applyPatches(restoredSplit, commits[0].inversePatches);
      expect(restored.left).toBe(restored.right);
      expect(restored.left.value).toBe(0);
    }
    store.destroy();
  }
);

test('a cached constant getter does not flatten later graph snapshots', () => {
  const store = create((set) => ({
    node: { self: null } as any,
    get constant() {
      return 1;
    },
    get linked() {
      return this.node.self === this.node;
    },
    link() {
      const node = cycle();
      set(() => {
        this.node = node;
      });
    }
  }));
  expect(store.getState().constant).toBe(1);
  store.getState().link();
  expect(store.getPureState().node.self).toBe(store.getPureState().node);
  expect(store.getState().linked).toBe(true);
  store.destroy();
});

test('external patch values retain cycles and aliases across patches', () => {
  const store = create(() => ({ left: null as any, right: null as any }));
  const value = cycle();
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => commits.push(commit));
  const before = store.getPureState();
  store.apply(before, [
    { op: 'replace', path: ['left'], value },
    { op: 'replace', path: ['right'], value }
  ]);
  for (const state of [
    store.getPureState(),
    applyPatches(before, commits[0].patches)
  ]) {
    expect(state.left).toBe(state.right);
    expect(state.left.self).toBe(state.left);
  }
  expect(applyPatches(store.getPureState(), commits[0].inversePatches)).toEqual(
    before
  );
  store.destroy();
});

test('history records identity-only changes and restores graph topology', () => {
  const store = create(
    (set) => ({
      left: { value: 1 } as any,
      right: { value: 1 } as any,
      link() {
        set(() => {
          this.left = this.right;
        });
      },
      cycle() {
        set(() => {
          this.left = cycle();
        });
      }
    }),
    { middlewares: [history()] }
  );
  const api = (store as unknown as { history: HistoryApi<object> }).history;
  store.getState().link();
  expect(store.getPureState().left).toBe(store.getPureState().right);
  expect(api.undo()).toBe(true);
  expect(store.getPureState().left).not.toBe(store.getPureState().right);
  expect(api.redo()).toBe(true);
  expect(store.getPureState().left).toBe(store.getPureState().right);
  store.getState().cycle();
  expect(store.getPureState().left.self).toBe(store.getPureState().left);
  expect(api.undo()).toBe(true);
  expect(store.getPureState().left).toBe(store.getPureState().right);
  expect(api.redo()).toBe(true);
  expect(store.getPureState().left.self).toBe(store.getPureState().left);
  store.destroy();
});

test('computed snapshots remain frozen and current after graph patch application', () => {
  const store = create(() => ({
    graph: null as any,
    get frozen() {
      return (
        this.graph === null ||
        (Object.isFrozen(this.graph) && Object.isFrozen(this.graph.child))
      );
    }
  }));
  expect(store.getState().frozen).toBe(true);
  const graph = { child: cycle() };
  store.apply(store.getPureState(), [
    { op: 'replace', path: ['graph'], value: graph }
  ]);
  expect(store.getState().frozen).toBe(true);
  expect(store.getPureState().graph.child.self).toBe(
    store.getPureState().graph.child
  );
  store.destroy();
});
