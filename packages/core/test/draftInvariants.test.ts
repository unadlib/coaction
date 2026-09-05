import { applyPatchesTo } from '../src/applyPatch';
import { scopeDraft } from '../src/draft';

/**
 * The properties a draft has to hold, checked over generated mutation
 * sequences rather than named cases. Array methods are where they break: a
 * `splice` is one operation to the caller and a burst of index assignments
 * underneath, and reconstructing intent from the assignments is how inverse
 * patches came to name indexes that had already moved.
 */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const operations = [
  (xs: number[], r: () => number) => xs.push(Math.floor(r() * 9)),
  (xs: number[]) => xs.pop(),
  (xs: number[]) => xs.shift(),
  (xs: number[], r: () => number) => xs.unshift(Math.floor(r() * 9)),
  (xs: number[], r: () => number) =>
    xs.splice(Math.floor(r() * (xs.length + 1)), 0, 7, 8),
  (xs: number[], r: () => number) =>
    xs.splice(Math.floor(r() * (xs.length + 1)), 2),
  (xs: number[], r: () => number) =>
    xs.splice(Math.floor(r() * (xs.length + 1)), 1, 5),
  (xs: number[], r: () => number) => {
    if (xs.length) xs[Math.floor(r() * xs.length)] = Math.floor(r() * 9);
  },
  (xs: number[], r: () => number) => {
    xs.length = Math.floor(r() * xs.length);
  },
  (xs: number[]) => xs.reverse()
];

test('array mutation sequences round-trip through their patches', () => {
  let checked = 0;
  for (let seed = 1; seed <= 2000; seed += 1) {
    const random = seeded(seed);
    const base = {
      xs: Array.from({ length: 1 + Math.floor(random() * 6) }, (_, i) => i)
    };
    const steps = 1 + Math.floor(random() * 4);
    const chosen = Array.from(
      { length: steps },
      () => operations[Math.floor(random() * operations.length)]
    );
    const { state, patches, inversePatches } = scopeDraft(base, (draft) => {
      for (const step of chosen) step(draft.xs, random);
    });

    expect(applyPatchesTo(base, patches)).toEqual(state);
    expect(applyPatchesTo(state, inversePatches)).toEqual(base);
    checked += 1;
  }
  expect(checked).toBe(2000);
});

test('nested object mutation sequences round-trip through their patches', () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const random = seeded(seed * 7);
    const base = {
      a: { b: { c: 1 }, list: [1, 2] },
      d: 'x' as unknown,
      e: { f: 2 } as Record<string, unknown>
    };
    const { state, patches, inversePatches } = scopeDraft(
      base,
      (draft: any) => {
        const steps = 1 + Math.floor(random() * 4);
        for (let step = 0; step < steps; step += 1) {
          const pick = Math.floor(random() * 6);
          if (pick === 0) draft.a.b.c = Math.floor(random() * 9);
          else if (pick === 1) draft.d = Math.floor(random() * 9);
          else if (pick === 2) draft.e[`k${Math.floor(random() * 3)}`] = 1;
          else if (pick === 3) delete draft.e.f;
          else if (pick === 4) draft.a.list.push(Math.floor(random() * 9));
          else draft.a = { b: { c: 9 }, list: [] };
        }
      }
    );
    expect(applyPatchesTo(base, patches)).toEqual(state);
    expect(applyPatchesTo(state, inversePatches)).toEqual(base);
  }
});

test('the base is never modified', () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const random = seeded(seed * 13);
    const base = { xs: [1, 2, 3], nested: { v: 1 } };
    const snapshot = JSON.stringify(base);
    scopeDraft(base, (draft: any) => {
      operations[Math.floor(random() * operations.length)](draft.xs, random);
      draft.nested.v = 2;
    });
    expect(JSON.stringify(base)).toBe(snapshot);
  }
});
