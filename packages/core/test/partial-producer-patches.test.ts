import { create } from '../src';
import { derivePath } from '../src/derived';
import { onStoreCommit, type StoreCommit } from '../src/storeCommit';
import { applyPatches } from '../src/utils';

const initial = () => ({
  rows: [0, 0],
  record: { a: 1, b: 2 },
  count: 0,
  other: { n: 0 }
});
type State = ReturnType<typeof initial>;
const recipes: Record<string, (state: State) => void> = {
  'signed zero and scalar sibling': (state) => {
    state.rows[0] = -0;
    state.count++;
  },
  'signed zero and object sibling': (state) => {
    state.rows[0] = -0;
    state.other = { n: 1 };
  },
  'signed zero in the same array': (state) => {
    state.rows[0] = -0;
    state.rows[1]++;
  },
  'key order and scalar sibling': (state) => {
    delete (state.record as Partial<State['record']>).a;
    state.record.a = 1;
    state.count++;
  },
  'key order and object sibling': (state) => {
    delete (state.record as Partial<State['record']>).a;
    state.record.a = 1;
    state.other = { n: 1 };
  },
  'key order in the same object': (state) => {
    delete (state.record as Partial<State['record']>).a;
    state.record.a = 1;
    state.record.b++;
  },
  'copied identity and scalar sibling': (state) => {
    state.rows[0]++;
    state.rows[0]--;
    state.count++;
  },
  'object removal inverse key order': (state) => {
    delete (state.record as Partial<State['record']>).a;
    state.count++;
  }
};

describe.each(['unwatched', 'commit', 'derived', 'getter'] as const)(
  '%s incomplete producer patches',
  (mode) => {
    test.each(Object.entries(recipes))('%s', (_, recipe) => {
      const baseline = create(initial());
      baseline.setState(recipe);
      const expected = baseline.getPureState();
      const store = create(() => ({
        ...initial(),
        get selected(): Pick<State, 'rows' | 'record'> {
          return { rows: this.rows, record: this.record };
        }
      }));
      const before = store.getPureState();
      const commits: StoreCommit[] = [];
      if (mode === 'commit')
        onStoreCommit(store, (commit) => {
          commits.push(commit);
        });
      const rows = mode === 'derived' ? derivePath(store, ['rows']) : undefined;
      const record =
        mode === 'derived' ? derivePath(store, ['record']) : undefined;
      const previousRows = rows?.();
      const previousGetter =
        mode === 'getter' ? store.getState().selected : undefined;
      if (record) record();
      store.setState(recipe);
      const assertValues = (state: Pick<State, 'rows' | 'record'>) => {
        expect(state.rows).toEqual(expected.rows);
        expect(Object.keys(state.record)).toEqual(Object.keys(expected.record));
        expect(state.record).toEqual(expected.record);
      };
      assertValues(store.getPureState());
      if (rows && record) {
        assertValues({ rows: rows(), record: record() });
        if (before.rows !== store.getPureState().rows)
          expect(rows()).not.toBe(previousRows);
      }
      if (previousGetter) {
        assertValues(store.getState().selected);
        expect(previousGetter.rows).toEqual(before.rows);
        expect(Object.keys(previousGetter.record)).toEqual(
          Object.keys(before.record)
        );
      }
      if (mode === 'commit') {
        expect(commits).toHaveLength(1);
        const replayed = applyPatches(before, commits[0].patches);
        assertValues(replayed);
        if (before.rows !== store.getPureState().rows)
          expect(replayed.rows).not.toBe(before.rows);
        const undone = applyPatches(replayed, commits[0].inversePatches);
        expect(undone).toEqual(before);
        expect(Object.keys(undone.record)).toEqual(Object.keys(before.record));
      }
      rows?.dispose();
      record?.dispose();
      store.destroy();
      baseline.destroy();
    });
  }
);
