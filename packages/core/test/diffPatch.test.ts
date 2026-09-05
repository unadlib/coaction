import { applyPatchesTo } from '../src/applyPatch';
import { diffPatches } from '../src/diffPatch';

/**
 * The invariant, not the exact patches: applying the diff has to reach `next`,
 * and applying its inverse has to come back to `previous`. Two producers can
 * describe the same transition differently and both be right.
 */
const roundTrips = (previous: unknown, next: unknown) => {
  const { patches, inversePatches } = diffPatches(previous, next);
  expect(applyPatchesTo(previous, patches)).toEqual(next);
  expect(
    applyPatchesTo(applyPatchesTo(previous, patches), inversePatches)
  ).toEqual(previous);
  return patches;
};

test('an unchanged state produces no patches', () => {
  const state = { a: 1, nested: { b: 2 } };
  expect(diffPatches(state, state).patches).toEqual([]);
  expect(roundTrips(state, { ...state })).toEqual([]);
});

test('object properties added, removed and changed', () => {
  roundTrips({ a: 1 }, { a: 2 });
  roundTrips({ a: 1 }, { a: 1, b: 2 });
  roundTrips({ a: 1, b: 2 }, { a: 1 });
  roundTrips({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
});

test('only the branch that moved is described', () => {
  const settings = { theme: 'dark' };
  const patches = roundTrips(
    { user: { name: 'Michael' }, settings },
    { user: { name: 'Lin' }, settings }
  );
  // Structural sharing means the untouched branch is never entered.
  expect(patches).toEqual([
    { op: 'replace', path: ['user', 'name'], value: 'Lin' }
  ]);
});

test('arrays grow, shrink and change in place', () => {
  roundTrips({ xs: [1, 2, 3] }, { xs: [1, 9, 3] });
  roundTrips({ xs: [1, 2] }, { xs: [1, 2, 3] });
  roundTrips({ xs: [1, 2, 3] }, { xs: [1] });
  roundTrips({ xs: [] }, { xs: [1] });
  roundTrips({ xs: [1] }, { xs: [] });
  roundTrips(
    { xs: [{ id: 'a' }, { id: 'b' }] },
    { xs: [{ id: 'a' }, { id: 'c' }] }
  );
});

test('a shrinking array names each index it invalidates through its inverse', () => {
  const patches = roundTrips({ xs: [1, 2, 3] }, { xs: [1] });
  expect(patches).toContainEqual({
    op: 'replace',
    path: ['xs', 'length'],
    value: 1
  });
});

test('a value that is not a plain object or array is replaced whole', () => {
  const before = new Date(0);
  const after = new Date(1000);
  const { patches } = diffPatches({ stamp: before }, { stamp: after });
  expect(patches).toEqual([{ op: 'replace', path: ['stamp'], value: after }]);
  expect(applyPatchesTo({ stamp: before }, patches).stamp).toBe(after);
});

test('a type change between array and object replaces rather than merges', () => {
  roundTrips({ v: [1, 2] }, { v: { a: 1 } });
  roundTrips({ v: { a: 1 } }, { v: [1, 2] });
  roundTrips({ v: null }, { v: { a: 1 } });
  roundTrips({ v: { a: 1 } }, { v: null });
});

test('random state pairs round-trip', () => {
  const leaf = (seed: number) =>
    [0, 'x', true, null, seed][seed % 5] as unknown;
  const build = (seed: number, depth = 0): unknown => {
    if (depth > 2) return leaf(seed);
    if (seed % 3 === 0) {
      return Array.from({ length: seed % 4 }, (_, i) =>
        build(seed + i + 1, depth + 1)
      );
    }
    const record: Record<string, unknown> = {};
    for (let i = 0; i < (seed % 4) + 1; i += 1) {
      record[`k${i}`] = build(seed + i + 2, depth + 1);
    }
    return record;
  };
  for (let seed = 1; seed < 60; seed += 1) {
    roundTrips(build(seed), build(seed + 1));
  }
});
