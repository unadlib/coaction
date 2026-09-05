import { applyPatchesTo } from '../src/applyPatch';
import { isCoactionDraft, scopeDraft } from '../src/draft';

/**
 * The properties a draft has to hold, checked over generated mutation
 * sequences rather than named cases. Array methods are where they break: a
 * `splice` is one operation to the caller and a burst of index assignments
 * underneath, and reconstructing intent from the assignments is how inverse
 * patches came to name indexes that had already moved.
 */
/**
 * Report the first sequence that breaks, rather than asserting on every one.
 *
 * Twenty thousand sequences times five checks is a hundred thousand assertion
 * calls, and the framework's bookkeeping for them costs more than the code
 * under test. Comparing directly and raising once keeps the failure message
 * while leaving the suite fast enough to run under coverage.
 */
const failed = (label: string, seed: number, detail?: unknown): never => {
  throw new Error(
    `${label} (seed ${seed})${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`
  );
};

/** Deep equality that survives the cycles these sequences build. */
const same = (
  left: unknown,
  right: unknown,
  seen = new Map<object, object>()
): boolean => {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null
  ) {
    return false;
  }
  const paired = seen.get(left);
  if (paired) return paired === right;
  seen.set(left, right);
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) {
    return false;
  }
  const keys = new Set([...Reflect.ownKeys(left), ...Reflect.ownKeys(right)]);
  for (const key of keys) {
    const inLeft = Object.prototype.hasOwnProperty.call(left, key);
    if (inLeft !== Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!inLeft) continue;
    if (
      !same(
        (left as Record<PropertyKey, unknown>)[key],
        (right as Record<PropertyKey, unknown>)[key],
        seen
      )
    ) {
      return false;
    }
  }
  return true;
};

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

    if (!same(applyPatchesTo(base, patches), state)) {
      failed('patches did not produce the state', seed);
    }
    if (!same(applyPatchesTo(state, inversePatches), base)) {
      failed('the inverse did not return to the base', seed);
    }
    checked += 1;
  }
  expect(checked).toBe(2000);
}, 30_000);

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
    if (!same(applyPatchesTo(base, patches), state)) {
      failed('patches did not produce the state', seed);
    }
    if (!same(applyPatchesTo(state, inversePatches), base)) {
      failed('the inverse did not return to the base', seed);
    }
  }
  expect(true).toBe(true);
}, 30_000);

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
}, 30_000);

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
    if (hasDraft(state)) failed('a draft reached the state', seed);
  }
  expect(true).toBe(true);
}, 30_000);

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
    const snapshot = structuredClone(base);
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

    if (!same(base, snapshot)) failed('the base changed', seed);
    if (hasDraft(state)) failed('a draft reached the state', seed);
    if (!same(applyPatchesTo(base, patches), state)) {
      failed('patches did not produce the state', seed);
    }
    if (!same(applyPatchesTo(state, inversePatches), base)) {
      failed('the inverse did not return to the base', seed);
    }
    if ((state as typeof base).untouched !== untouched) {
      failed('an untouched branch lost its identity', seed);
    }
    sequences += 1;
  }
  expect(sequences).toBe(20000);
}, 30_000);

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

    if (!sameShape(base.xs, snapshot)) failed('the base changed', seed);
    if (base.hidden !== 7) failed('the base lost a hidden property', seed);
    const forward = applyPatchesTo(base, patches) as typeof base;
    if (!sameShape(forward.xs, state.xs)) {
      failed('patches did not produce the state', seed);
    }
    if (forward.count !== state.count) failed('a value did not carry', seed);
    // A non-enumerable property is state, and has to come through both ways.
    if (forward.hidden !== 7) failed('a hidden property did not carry', seed);
    const back = applyPatchesTo(state, inversePatches) as typeof base;
    if (!sameShape(back.xs, snapshot)) {
      failed('the inverse did not return to the base', seed);
    }
    if (back.hidden !== 7) failed('the inverse lost a hidden property', seed);
  }
}, 30_000);

test('an array method costs what the change costs, not what the array costs', () => {
  // Comparing the whole array before and after is right for a method that
  // rearranges it and quadratic for one that touches an end. A push onto twenty
  // thousand elements copied and compared all of them, at roughly 33ms each.
  const size = 20000;
  const base = { xs: Array.from({ length: size }, (_, index) => index) };
  const started = performance.now();
  for (let round = 0; round < 10; round += 1) {
    scopeDraft(base, (draft) => {
      draft.xs.push(round);
      draft.xs.pop();
      draft.xs.unshift(round);
      draft.xs.shift();
      draft.xs.splice(5, 1, round);
    });
  }
  const elapsed = performance.now() - started;
  expect(base.xs).toHaveLength(size);
  // Well under what the per-call comparison cost, and well above anything a
  // slower machine would need.
  expect(elapsed).toBeLessThan(2000);
}, 30_000);

test('a method that touches an end describes only what it touched', () => {
  const base: { xs: unknown[] } = {
    xs: Array.from({ length: 500 }, (_, index) => index)
  };
  const pushed = scopeDraft(base, (draft) => {
    draft.xs.push(1, 2);
  });
  // Two additions and a length restore, not five hundred comparisons.
  expect(pushed.patches).toHaveLength(2);
  expect(pushed.inversePatches).toHaveLength(1);
  expect(applyPatchesTo(base, pushed.patches)).toEqual(pushed.state);
  expect(applyPatchesTo(pushed.state, pushed.inversePatches)).toEqual(base);

  const spliced = scopeDraft(base, (draft: { xs: unknown[] }) => {
    draft.xs.splice(10, 2, 'a', 'b', 'c');
  });
  expect(spliced.patches).toHaveLength(5);
  expect(applyPatchesTo(base, spliced.patches)).toEqual(spliced.state);
  expect(applyPatchesTo(spliced.state, spliced.inversePatches)).toEqual(base);
}, 30_000);
