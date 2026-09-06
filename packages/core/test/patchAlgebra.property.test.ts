import { create as createWithMutative, type Patches } from 'mutative';
import { create } from '../src';
import { onStoreCommit, type StoreCommit } from '../adapter';
import { createRandom, forEachSeed, type Random } from './random';
import {
  applyPatches,
  createInversePatches,
  createRootReplacementPatches
} from '../adapter';
import { inverseNeedsDerivation, isSameStructure } from '../src/utils';

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

/**
 * `describable` is false when the pair the runtime emitted does not describe
 * the transition: mutative records paths positionally, so a recipe that drafts
 * a nested value, moves it within its parent array, and then writes into it
 * records the position the value used to have. Applying that pair throws, or --
 * when the old position still exists -- succeeds and produces a different
 * state.
 *
 * Those never reach a commit. Coaction detects them and describes the
 * transition as the difference between the states instead, which
 * `a transition the runtime cannot describe is described more coarsely`
 * asserts. The properties here are about the pairs that are committed as they
 * come.
 */
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
  // Describes the transition, not merely applies. A stale position can land
  // somewhere that exists, and then the pair applies cleanly to a state the
  // recipe did not produce -- which is the same defect without the throw.
  let describable = true;
  try {
    if (!isSameStructure(applyPatches(before, patches), after)) {
      describable = false;
    }
  } catch {
    describable = false;
  }
  return { before, after, patches, mutativeInverse, describable };
};

test('applying a patch pair reaches the state it was produced from', () => {
  forEachSeed(500, (random) => {
    const { before, after, patches, describable } = transition(random);
    if (!describable) return;
    expect(applyPatches(before, patches)).toEqual(after);
  });
});

test('a derived inverse undoes exactly what the patches did', () => {
  forEachSeed(500, (random) => {
    const { before, after, patches, describable } = transition(random);
    if (!describable) return;
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
  let checked = 0;
  forEachSeed(2000, (random) => {
    const { before, after, patches, mutativeInverse, describable } =
      transition(random);
    if (!describable) return;
    checked += 1;
    if (inverseNeedsDerivation(patches)) derived += 1;
    expect(
      applyPatches(after, commitInverse(before, patches, mutativeInverse))
    ).toEqual(before);
  });
  // The derivation is the exception, not the rule: taking it always would cost
  // every commit its shared references. As a share of what was checked, so the
  // claim holds at whatever scale a soak runs at.
  expect(derived).toBeGreaterThan(0);
  expect(derived).toBeLessThan(checked * 0.2);
});

test('a derived inverse undoes what the patches did, every time', () => {
  forEachSeed(2000, (random) => {
    const { before, after, patches, describable } = transition(random);
    if (!describable) return;
    expect(applyPatches(after, createInversePatches(before, patches))).toEqual(
      before
    );
  });
});

test('the shape that needs a derivation is the shape that breaks without one', () => {
  let unflagged = 0;
  forEachSeed(2000, (random) => {
    const { before, after, patches, mutativeInverse, describable } =
      transition(random);
    if (!describable || inverseNeedsDerivation(patches)) return;
    // Everything the check waves through has to survive being applied as it
    // came. A miss here is a commit whose inverse throws when somebody uses it.
    try {
      expect(applyPatches(after, mutativeInverse)).toEqual(before);
    } catch (error) {
      unflagged += 1;
      console.log('UNFLAGGED patches:', JSON.stringify(patches));
      console.log('UNFLAGGED inverse:', JSON.stringify(mutativeInverse));
      console.log('UNFLAGGED before :', JSON.stringify(before));
      console.log('UNFLAGGED after  :', JSON.stringify(after));
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

/**
 * The trie is an optimisation, and the thing it optimises is three lines. So
 * the three lines are written out here and the two are required to agree.
 *
 * This is not the model-testing trap of writing a second implementation of a
 * system and calling the agreement proof: the reference below is the definition
 * -- is any patch's path a proper prefix of an earlier one's -- and the trie is
 * a faster way to compute it. A disagreement means the fast one is wrong.
 */
const referenceNeedsDerivation = (patches: Patches) => {
  const paths = patches.map((patch) =>
    (Array.isArray(patch.path) ? patch.path : String(patch.path).split('/'))
      .filter((segment) => segment !== '')
      .map(String)
  );
  const isProperPrefix = (shorter: string[], longer: string[]) =>
    shorter.length < longer.length &&
    shorter.every((segment, index) => segment === longer[index]);
  for (let later = 1; later < paths.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      // Either direction. One patch replacing what another writes inside it is
      // unsafe whichever came first: undoing the container before the write
      // inside it re-applies into something already whole, and undoing the
      // write first puts it somewhere that is about to be replaced.
      if (
        isProperPrefix(paths[later], paths[earlier]) ||
        isProperPrefix(paths[earlier], paths[later])
      ) {
        return true;
      }
    }
  }
  return false;
};

test('the fast check agrees with the definition it stands in for', () => {
  let flagged = 0;
  forEachSeed(2000, (random) => {
    const { patches } = transition(random);
    const expected = referenceNeedsDerivation(patches);
    if (expected) flagged += 1;
    expect(inverseNeedsDerivation(patches)).toBe(expected);
  });
  expect(flagged).toBeGreaterThan(0);
});

test('the fast check agrees on paths built to collide', () => {
  forEachSeed(2000, (random) => {
    // Paths drawn from a tiny alphabet, so prefixes and repeats are common --
    // random state mutation produces them rarely, and the trie is exactly the
    // part that could get them wrong.
    const patches = random.list(0, 8, () => ({
      op: 'replace' as const,
      path: random.list(0, 4, () => random.pick(['a', 'b', '0', '1'])),
      value: 1
    })) as unknown as Patches;
    expect(inverseNeedsDerivation(patches)).toBe(
      referenceNeedsDerivation(patches)
    );
  });
});

/**
 * A transition the runtime cannot express as a patch pair.
 *
 * mutative records paths positionally. Draft a nested value, move it within its
 * parent array, then write into it, and the write is recorded at the position
 * the value used to have -- so the pair describes a change to something that is
 * no longer there, and applying it throws.
 *
 * Coaction makes a transition by applying that pair, so this used to fail at
 * the `set()`. Only when something was watching: on a store with no listener,
 * no validator and no observer, no pair is produced and the same recipe worked.
 * Attaching a devtool changed what the application was allowed to do.
 *
 * It is now described the other way instead -- the difference between the state
 * before and the state the recipe produced -- so the recipe succeeds either
 * way, and the commit still replays.
 */
const unrepresentableStore = () => {
  const collectArrays = (
    node: unknown,
    found: unknown[][] = []
  ): unknown[][] => {
    if (Array.isArray(node)) found.push(node);
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        collectArrays((node as Record<string, unknown>)[key], found);
      }
    }
    return found;
  };
  return create<{
    items: Record<string, unknown>;
    rows: unknown[];
    move: () => void;
  }>((set) => ({
    items: { '0': [1.5, 1, null, ''], b: [] },
    rows: [false, [-1, 0, '', true], { a: -1 }, [0, '', 1.5, '']],
    move() {
      set(() => {
        collectArrays(this);
        this.rows.unshift('moved');
        const moved = collectArrays(this).find(
          (row) => row.length === 4 && row[0] === -1
        );
        if (moved) moved.length = 3;
      });
    }
  }));
};

test('a transition the runtime cannot describe is described more coarsely', () => {
  const unwatched = unrepresentableStore();
  unwatched.getState().move();
  const expected = JSON.parse(JSON.stringify(unwatched.getPureState()));
  unwatched.destroy();

  const watched = unrepresentableStore();
  const before = JSON.parse(JSON.stringify(watched.getPureState()));
  const commits: StoreCommit[] = [];
  onStoreCommit(watched, (commit) => commits.push(commit));

  // The same recipe, and the same result, on a store that is being watched.
  expect(() => watched.getState().move()).not.toThrow();
  expect(watched.getPureState()).toEqual(expected);

  // One patch, for the one top-level key that changed -- not the whole root.
  expect(commits).toHaveLength(1);
  expect(commits[0].patches.map(({ path }) => path)).toEqual([['rows']]);
  expect(applyPatches(before as object, commits[0].patches)).toEqual(
    watched.getPureState()
  );
  expect(
    applyPatches(watched.getPureState() as object, commits[0].inversePatches)
  ).toEqual(before);
  watched.destroy();
});

test('watching a store never changes what a recipe is allowed to do', () => {
  // Over the generated recipes, not just the one shape above: whatever a store
  // with nothing attached accepts, a store with a listener accepts too, and
  // reaches the same state.
  forEachSeed(400, (random) => {
    const seed = random.integer(0, 2 ** 30);
    const build = () =>
      create<{ state: Record<string, unknown>; run: () => void }>((set) => {
        const initial = state(createRandom(seed));
        return {
          ...(initial as object),
          run() {
            set(() => {
              const inner = createRandom(seed + 1);
              const steps = inner.integer(1, 4);
              for (let step = 0; step < steps; step += 1) {
                mutate(inner, this);
              }
            });
          }
        } as never;
      });

    const unwatched = build();
    let unwatchedError: unknown;
    try {
      unwatched.getState().run();
    } catch (error) {
      unwatchedError = error;
    }
    const expected = JSON.parse(JSON.stringify(unwatched.getPureState()));
    unwatched.destroy();

    const watched = build();
    const before = JSON.parse(JSON.stringify(watched.getPureState()));
    const commits: StoreCommit[] = [];
    onStoreCommit(watched, (commit) => commits.push(commit));
    let watchedError: unknown;
    try {
      watched.getState().run();
    } catch (error) {
      watchedError = error;
    }

    expect(Boolean(watchedError)).toBe(Boolean(unwatchedError));
    expect(watched.getPureState()).toEqual(expected);
    if (!watchedError && commits.length) {
      expect(applyPatches(before as object, commits[0].patches)).toEqual(
        watched.getPureState()
      );
      expect(
        applyPatches(
          watched.getPureState() as object,
          commits[0].inversePatches
        )
      ).toEqual(before);
    }
    watched.destroy();
  });
});
