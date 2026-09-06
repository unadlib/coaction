import { create as createWithMutative, type Patches } from 'mutative';
import { forEachSeed, type Random } from './random';
import {
  applyPatches,
  createInversePatches,
  createRootReplacementPatches
} from '../adapter';
import { inverseNeedsDerivation } from '../src/utils';

/**
 * The law every consumer of patches leans on:
 *
 *     apply(apply(state, patches), inverse(state, patches)) === state
 *
 * `@coaction/history` undoes by applying an inverse. `@coaction/sync` rebases
 * by rolling back with inverses, applying the remote, and replaying. The commit
 * point derives an inverse for `store.apply(state, patches)`. All three are the
 * same claim, and none of them is checked by a model of mine: the oracle is the
 * state that went in.
 *
 * Patches are produced by mutating with mutative rather than invented, so the
 * sequences are ones the runtime actually emits -- including the awkward ones,
 * where an array is shortened through `length` and the elements go without a
 * patch each.
 */

type Value = unknown;

const leaf = (random: Random): Value =>
  random.pick([0, 1, -1, 'x', '', true, false, null, 1.5]);

const build = (random: Random, depth: number): Value => {
  if (depth <= 0 || random.chance(0.35)) return leaf(random);
  if (random.chance(0.45)) {
    return random.list(0, 4, () => build(random, depth - 1));
  }
  return Object.fromEntries(
    random.list(1, 4, () => [random.word(), build(random, depth - 1)])
  );
};

const state = (random: Random) =>
  Object.fromEntries(
    random.list(1, 4, () => [random.word(), build(random, 2)])
  ) as Record<string, unknown>;

/** A path into the draft that exists, or a fresh key on some object in it. */
const walk = (random: Random, draft: any): { parent: any; key: string } => {
  let node = draft;
  for (let step = 0; step < 3; step += 1) {
    const keys = Object.keys(node ?? {});
    if (!keys.length || random.chance(0.4)) break;
    const key = random.pick(keys);
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      return { parent: node, key };
    }
    node = next;
  }
  const keys = Object.keys(node ?? {});
  return {
    parent: node,
    key: keys.length && random.chance(0.7) ? random.pick(keys) : random.word()
  };
};

const arraysIn = (node: any, found: any[] = []): any[] => {
  if (Array.isArray(node)) found.push(node);
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) arraysIn(node[key], found);
  }
  return found;
};

const mutate = (random: Random, draft: any) => {
  const arrays = arraysIn(draft);
  const useArray = arrays.length > 0 && random.chance(0.5);
  if (useArray) {
    const list = random.pick(arrays);
    switch (
      random.pick([
        'push',
        'pop',
        'shift',
        'unshift',
        'splice',
        'reverse',
        'sort',
        'length',
        'index'
      ] as const)
    ) {
      case 'push':
        list.push(build(random, 1));
        return;
      case 'pop':
        list.pop();
        return;
      case 'shift':
        list.shift();
        return;
      case 'unshift':
        list.unshift(build(random, 1));
        return;
      case 'splice':
        list.splice(
          random.integer(0, list.length),
          random.integer(0, 2),
          build(random, 1)
        );
        return;
      case 'reverse':
        list.reverse();
        return;
      case 'sort':
        list.sort();
        return;
      case 'length':
        // The documented awkward one: shortening drops elements with no patch
        // per index, so the inverse has to carry the array itself.
        list.length = random.integer(0, list.length);
        return;
      default:
        if (list.length)
          list[random.integer(0, list.length - 1)] = build(random, 1);
        return;
    }
  }
  const { parent, key } = walk(random, draft);
  if (!parent || typeof parent !== 'object') return;
  if (random.chance(0.25) && key in parent) {
    delete parent[key];
    return;
  }
  parent[key] = build(random, 1);
};

const transition = (random: Random) => {
  const before = state(random);
  const [after, patches, mutativeInverse] = createWithMutative(
    before,
    (draft) => {
      const steps = random.integer(1, 4);
      for (let step = 0; step < steps; step += 1) mutate(random, draft);
    },
    { enablePatches: true }
  ) as [Record<string, unknown>, Patches, Patches];
  return { before, after, patches, mutativeInverse };
};

test('applying a patch pair reaches the state it was produced from', () => {
  forEachSeed(500, (random) => {
    const { before, after, patches } = transition(random);
    expect(applyPatches(before, patches)).toEqual(after);
  });
});

test('a derived inverse undoes exactly what the patches did', () => {
  forEachSeed(500, (random) => {
    const { before, after, patches } = transition(random);
    // This is Coaction's own inverse, the one the commit point derives when a
    // caller supplies patches and no other half.
    const inverse = createInversePatches(before, patches);
    expect(applyPatches(after, inverse)).toEqual(before);
  });
});

/**
 * What a `StoreCommit` carries, over the same inputs. mutative's own inverse is
 * kept where it can be applied -- it preserves shared and cyclic references,
 * which a derivation flattens -- and derived where it cannot.
 */
const commitInverse = (
  before: unknown,
  patches: Patches,
  mutativeInverse: Patches
) =>
  inverseNeedsDerivation(patches)
    ? createInversePatches(before, patches)
    : mutativeInverse;

test('the inverse a commit carries always undoes it', () => {
  let derived = 0;
  forEachSeed(2000, (random) => {
    const { before, after, patches, mutativeInverse } = transition(random);
    if (inverseNeedsDerivation(patches)) derived += 1;
    expect(
      applyPatches(after, commitInverse(before, patches, mutativeInverse))
    ).toEqual(before);
  });
  // The derivation is the exception, not the rule: taking it always would cost
  // every commit its shared references.
  expect(derived).toBeGreaterThan(0);
  expect(derived).toBeLessThan(200);
});

test('a derived inverse undoes what the patches did, every time', () => {
  forEachSeed(2000, (random) => {
    const { before, after, patches } = transition(random);
    expect(applyPatches(after, createInversePatches(before, patches))).toEqual(
      before
    );
  });
});

test('the shape that needs a derivation is the shape that breaks without one', () => {
  let unflagged = 0;
  forEachSeed(2000, (random) => {
    const { before, after, patches, mutativeInverse } = transition(random);
    if (inverseNeedsDerivation(patches)) return;
    // Everything the check waves through has to survive being applied as it
    // came. A miss here is a commit whose inverse throws when somebody uses it.
    try {
      expect(applyPatches(after, mutativeInverse)).toEqual(before);
    } catch (error) {
      unflagged += 1;
      throw error;
    }
  });
  expect(unflagged).toBe(0);
});

test('a root replacement pair travels in both directions', () => {
  forEachSeed(400, (random) => {
    const before = state(random);
    const after = state(random);
    const replacement = createRootReplacementPatches(before, after);
    expect(applyPatches(before, replacement.patches as Patches)).toEqual(after);
    expect(applyPatches(after, replacement.inversePatches as Patches)).toEqual(
      before
    );
  });
});
