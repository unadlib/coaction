import { create } from '../src';
import { derivePath } from '../src/derived';
import { onStoreCommit, type StoreCommit } from '../src/storeCommit';
import { applyPatches } from '../src/utils';

test('empty producer patches preserve copied identities and key order in commits', () => {
  const store = create({ record: { a: 1, b: 2 }, n: 0 });
  const record = derivePath(store, ['record']);
  const original = record();
  const commits: StoreCommit[] = [];
  onStoreCommit(store, (commit) => {
    commits.push(commit);
  });
  const before = store.getPureState();
  store.setState((state) => {
    delete (state.record as any).a;
    state.record.a = 1;
  });
  expect(record()).not.toBe(original);
  expect(Object.keys(record())).toEqual(['b', 'a']);
  expect(commits).toHaveLength(1);
  const replayed = applyPatches(before, commits[0].patches);
  expect(Object.keys(replayed.record)).toEqual(['b', 'a']);
  const undone = applyPatches(replayed, commits[0].inversePatches);
  expect(Object.keys(undone.record)).toEqual(['a', 'b']);
  commits.length = 0;
  store.setState((state) => {
    state.n++;
    state.n--;
  });
  expect(commits).toHaveLength(1);
  store.setState((state) => {
    state.n = 0;
  });
  expect(commits).toHaveLength(1);
  record.dispose();
  store.destroy();
});

test.each(['unwatched', 'commit', 'derived', 'getter'] as const)(
  '%s recipes preserve signed zero with published Mutative',
  (mode) => {
    const store = create(() => ({
      rows: [0],
      get first() {
        return this.rows[0];
      }
    }));
    const commits: StoreCommit[] = [];
    if (mode === 'commit') {
      onStoreCommit(store, (commit) => {
        commits.push(commit);
      });
    }
    const selected =
      mode === 'derived' ? derivePath(store, ['rows', 0]) : undefined;
    if (selected) expect(selected()).toBe(0);
    if (mode === 'getter') expect(store.getState().first).toBe(0);
    for (const value of [-0, 0]) {
      const before = store.getPureState();
      store.setState((state) => {
        state.rows[0] = value;
      });
      expect(store.getPureState().rows[0]).toBe(value);
      expect(before.rows[0]).toBe(Object.is(value, -0) ? 0 : -0);
      if (selected) expect(selected()).toBe(value);
      if (mode === 'getter') expect(store.getState().first).toBe(value);
      if (mode === 'commit') {
        expect(commits).toHaveLength(1);
        const replayed = applyPatches(before, commits[0].patches);
        expect(replayed.rows[0]).toBe(value);
        const restored = applyPatches(replayed, commits[0].inversePatches);
        expect(restored.rows[0]).toBe(before.rows[0]);
        commits.length = 0;
      }
    }
    selected?.dispose();
    store.destroy();
  }
);

test('getter snapshots retain key order after an empty producer patch list', () => {
  const store = create(() => ({
    record: { a: 1, b: 2 },
    get snapshot() {
      return this.record;
    }
  }));
  const previous = store.getState().snapshot;
  store.setState((state) => {
    delete (state.record as Partial<typeof state.record>).a;
    state.record.a = 1;
  });
  const next = store.getState().snapshot;
  expect(Object.keys(next)).toEqual(['b', 'a']);
  expect(next).not.toBe(previous);
  expect(() => {
    next.a = 9;
  }).toThrow();
  expect(Object.keys(previous)).toEqual(['a', 'b']);
  store.destroy();
});
