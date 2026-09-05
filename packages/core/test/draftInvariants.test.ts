import { applyPatchesTo } from '../src/applyPatch';
import { isCoactionDraft, scopeDraft } from '../src/draft';

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

test('no draft ever reaches the published state', () => {
  const hasDraft = (value: unknown, seen = new Set<object>()): boolean => {
    if (typeof value !== 'object' || value === null) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (isCoactionDraft(value)) return true;
    return Reflect.ownKeys(value).some((key) =>
      hasDraft((value as Record<PropertyKey, unknown>)[key], seen)
    );
  };
  for (let seed = 1; seed <= 500; seed += 1) {
    const random = seeded(seed * 17);
    const base = {
      items: [{ v: 1 }, { v: 2 }],
      user: { profile: { name: 'a' } },
      out: null as unknown
    };
    const { state } = scopeDraft(base, (draft: any) => {
      const pick = Math.floor(random() * 5);
      if (pick === 0) draft.out = draft.items.slice();
      else if (pick === 1) draft.out = { ...draft.user };
      else if (pick === 2) draft.out = [draft.items[0], draft.user];
      else if (pick === 3) draft.out = { nested: { deep: draft.user.profile } };
      else draft.out = draft.items.map((item: any) => item);
    });
    // A draft inside the state is a live handle on it that throws on read once
    // finalized, which is how one escaping shows up much later and elsewhere.
    expect(hasDraft(state)).toBe(false);
  }
});

test('every invariant holds across generated mutation sequences', () => {
  const hasDraft = (value: unknown, seen = new Set<object>()): boolean => {
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      return false;
    }
    seen.add(value);
    if (isCoactionDraft(value)) return true;
    return Reflect.ownKeys(value).some((key) =>
      hasDraft((value as Record<PropertyKey, unknown>)[key], seen)
    );
  };

  let sequences = 0;
  for (let seed = 1; seed <= 20000; seed += 1) {
    const random = seeded(seed);
    const base = {
      xs: Array.from({ length: 1 + Math.floor(random() * 5) }, (_, i) => i),
      items: [{ v: 1 }, { v: 2 }],
      user: { profile: { name: 'a' }, tags: ['x'] },
      untouched: { keep: true },
      out: null as unknown
    };
    const snapshot = JSON.stringify(base);
    const untouched = base.untouched;

    const { state, patches, inversePatches } = scopeDraft(
      base,
      (draft: any) => {
        const steps = 1 + Math.floor(random() * 4);
        for (let step = 0; step < steps; step += 1) {
          const pick = Math.floor(random() * 12);
          if (pick < 6) {
            operations[Math.floor(random() * operations.length)](
              draft.xs,
              random
            );
          } else if (pick === 6) {
            draft.user.profile.name = `n${Math.floor(random() * 9)}`;
          } else if (pick === 7) {
            draft.items.push({ v: Math.floor(random() * 9) });
          } else if (pick === 8) {
            // A wrapper holding one draft at two paths, and one holding itself:
            // both used to leave a draft behind on the second visit.
            const shared = { user: draft.user };
            draft.out = { a: shared, b: shared };
          } else if (pick === 9) {
            const wrapper: any = { items: draft.items, user: draft.user };
            wrapper.self = wrapper;
            draft.out = wrapper;
          } else if (pick === 10) {
            const removed = draft.items.pop();
            if (removed) removed.v = 99;
          } else {
            draft.user.tags.unshift(`t${Math.floor(random() * 9)}`);
          }
        }
      }
    );

    expect(JSON.stringify(base)).toBe(snapshot);
    expect(hasDraft(state)).toBe(false);
    expect(applyPatchesTo(base, patches)).toEqual(state);
    expect(applyPatchesTo(state, inversePatches)).toEqual(base);
    expect((state as typeof base).untouched).toBe(untouched);
    sequences += 1;
  }
  expect(sequences).toBe(20000);
});

test('the invariants hold for sparse arrays and unusual descriptors too', () => {
  const marker = Symbol('marker');
  const sameShape = (a: unknown[], b: unknown[]) => {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      const inA = Object.prototype.hasOwnProperty.call(a, index);
      if (inA !== Object.prototype.hasOwnProperty.call(b, index)) return false;
      if (inA && !Object.is(a[index], b[index])) return false;
    }
    return (
      (a as never as Record<string, unknown>).label ===
        (b as never as Record<string, unknown>).label &&
      (a as never as Record<symbol, unknown>)[marker] ===
        (b as never as Record<symbol, unknown>)[marker]
    );
  };

  for (let seed = 1; seed <= 5000; seed += 1) {
    const random = seeded(seed * 31);
    const xs: unknown[] & { label?: string } = [];
    xs.length = 2 + Math.floor(random() * 4);
    for (let index = 0; index < xs.length; index += 1) {
      // Leave some positions as holes rather than as undefined.
      if (random() < 0.5) xs[index] = index;
    }
    xs.label = 'kept';
    (xs as never as Record<symbol, string>)[marker] = 'kept';

    const base = { xs, count: 1 } as {
      xs: typeof xs;
      count: number;
      hidden?: number;
    };
    Object.defineProperty(base, 'hidden', {
      value: 7,
      enumerable: false,
      writable: true,
      configurable: true
    });
    // `slice` drops the properties hung off an array, so the snapshot has to
    // be taken by descriptor or it never matches to begin with.
    const snapshot: unknown[] = [];
    Object.defineProperties(
      snapshot,
      Object.getOwnPropertyDescriptors(base.xs)
    );

    const { state, patches, inversePatches } = scopeDraft(
      base,
      (draft: any) => {
        const steps = 1 + Math.floor(random() * 3);
        for (let step = 0; step < steps; step += 1) {
          const pick = Math.floor(random() * 8);
          if (pick < 5) {
            operations[Math.floor(random() * operations.length)](
              draft.xs,
              random
            );
          } else if (pick === 5) {
            draft.xs[Math.floor(random() * (draft.xs.length + 2))] = 9;
          } else if (pick === 6) {
            if (draft.xs.length) {
              delete draft.xs[Math.floor(random() * draft.xs.length)];
            }
          } else {
            draft.count += 1;
          }
        }
      }
    );

    expect(sameShape(base.xs, snapshot)).toBe(true);
    expect(base.hidden).toBe(7);
    const forward = applyPatchesTo(base, patches) as typeof base;
    expect(sameShape(forward.xs, state.xs)).toBe(true);
    expect(forward.count).toBe(state.count);
    // A non-enumerable property is state, and has to come through both ways.
    expect(forward.hidden).toBe(7);
    const back = applyPatchesTo(state, inversePatches) as typeof base;
    expect(sameShape(back.xs, snapshot)).toBe(true);
    expect(back.hidden).toBe(7);
  }
});
