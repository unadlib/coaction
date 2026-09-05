import { apply as applyWithMutative } from 'mutative';
import { createInversePatches } from '../src/utils';

/** The invariant an inverse has to satisfy: undoing a change restores it. */
const roundTrip = (state: unknown, patches: any) => {
  const inverse = createInversePatches(state, patches);
  const forward = applyWithMutative(state as any, patches);
  return applyWithMutative(forward as any, inverse as any);
};

test('shortening an array through length round-trips its elements', () => {
  const state = { items: [1, 2, 3] };
  const restored = roundTrip(state, [
    { op: 'replace', path: ['items', 'length'], value: 1 }
  ]) as typeof state;

  // Restoring the length alone would give [1, <empty>, <empty>].
  expect(restored.items).toEqual([1, 2, 3]);
  expect(Object.prototype.hasOwnProperty.call(restored.items, 1)).toBe(true);
});

test('shortening a list of objects round-trips their contents', () => {
  const state = { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const restored = roundTrip(state, [
    { op: 'replace', path: ['rows', 'length'], value: 1 }
  ]) as typeof state;

  expect(restored.rows).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('growing an array through length still round-trips', () => {
  const state = { items: [1] };
  const restored = roundTrip(state, [
    { op: 'replace', path: ['items', 'length'], value: 3 }
  ]) as typeof state;

  expect(restored.items).toEqual([1]);
  expect(restored.items.length).toBe(1);
});

test('an ordinary replace still produces a path-local inverse', () => {
  const state = { user: { name: 'Michael', age: 30 } };
  const patches = [{ op: 'replace', path: ['user', 'age'], value: 31 }];
  const inverse = createInversePatches(state, patches as any);

  // Unchanged behaviour: it must not start replacing whole parents.
  expect(inverse).toEqual([
    { op: 'replace', path: ['user', 'age'], value: 30 }
  ]);
  expect(roundTrip(state, patches)).toEqual(state);
});

test('a length key on a plain object is not treated as a truncation', () => {
  const state = { form: { length: 5, label: 'x' } };
  const patches = [{ op: 'replace', path: ['form', 'length'], value: 1 }];
  const inverse = createInversePatches(state, patches as any);

  expect(inverse).toEqual([
    { op: 'replace', path: ['form', 'length'], value: 5 }
  ]);
  expect(roundTrip(state, patches)).toEqual(state);
});
