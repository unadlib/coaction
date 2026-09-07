import { create } from '../index';
import {
  applyPatches,
  onStoreCommit,
  type StoreCommit
} from 'coaction/adapter';
import { forEachSeed } from './random';

test('computed snapshots stay frozen and replayable across mixed array writes', () => {
  forEachSeed(25, (random) => {
    type Data = { rows: Array<{ nested: { value: number } }>; count: number };
    let expected: Data = { rows: [{ nested: { value: 0 } }], count: 0 };
    let captured: Data['rows'] = [];
    const store = create(() => ({
      ...structuredClone(expected),
      get total(): number {
        captured = this.rows;
        return this.rows.reduce(
          (sum, row) => sum + row.nested.value,
          this.count
        );
      },
      get first(): { value: number } | undefined {
        return this.rows[0]?.nested;
      }
    }));
    const commits: StoreCommit[] = [];
    onStoreCommit(store, (value) => {
      commits.push(value);
    });
    for (let step = 0; step < 30; step += 1) {
      expect(store.getState().total).toBe(
        expected.rows.reduce(
          (sum, row) => sum + row.nested.value,
          expected.count
        )
      );
      const oldSnapshot = captured;
      const oldContents = structuredClone(captured);
      const before = store.getPureState();
      const kind = random.integer(0, 6);
      const index = random.integer(0, Math.max(0, expected.rows.length - 1));
      const value = random.integer(-100, 100);
      const recipe = (state: Data) => {
        if (kind === 0 && state.rows.length)
          state.rows[index].nested.value = value;
        else if (kind === 1) state.rows.reverse();
        else if (kind === 2) state.rows.splice(index, 1, { nested: { value } });
        else if (kind === 3) state.rows.push({ nested: { value } });
        else if (kind === 4) state.rows.length = Math.min(2, state.rows.length);
        else if (kind === 5) {
          state.count += 1;
          for (const row of state.rows) row.nested.value += 1;
        } else state.rows = [{ nested: { value } }, ...state.rows];
      };
      expected = structuredClone(expected);
      recipe(expected);
      commits.length = 0;
      store.setState(recipe);
      expect(store.getState().total).toBe(
        expected.rows.reduce(
          (sum, row) => sum + row.nested.value,
          expected.count
        )
      );
      expect(captured).toEqual(expected.rows);
      expect(oldSnapshot).toEqual(oldContents);
      expect(Object.isFrozen(captured)).toBe(true);
      for (const row of captured) {
        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.nested)).toBe(true);
      }
      expect(store.getState().first).toBe(store.getState().rows[0]?.nested);
      const commit = commits[0];
      if (commit) {
        expect(applyPatches(before, commit.patches)).toEqual(
          store.getPureState()
        );
        expect(
          applyPatches(store.getPureState(), commit.inversePatches)
        ).toEqual(before);
      }
    }
    store.destroy();
  });
}, 600000);
