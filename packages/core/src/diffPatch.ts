import { asArrayIndex, isPatchTraversable } from './patch';
import type { Patch, Patches } from './patch';

/**
 * Work out the transition between two immutable states.
 *
 * A producer that writes the next state directly -- an immutable updater, a
 * merge, a snapshot handed in from outside -- has no draft to read patches off,
 * and structural sharing is what makes recovering them cheap: a branch whose
 * reference did not change cannot contain a change, so the walk never enters
 * it. The cost is the size of what actually moved, not the size of the state.
 *
 * The patch domain is the one `applyPatch` traverses, so anything that is not a
 * plain object or an array is compared by identity and replaced whole.
 */
const replaceAt = (
  path: PropertyKey[],
  previous: unknown,
  next: unknown,
  patches: Patches,
  inversePatches: Patches
) => {
  patches.push({ op: 'replace', path, value: next });
  inversePatches.unshift({ op: 'replace', path, value: previous });
};

const walk = (
  previous: unknown,
  next: unknown,
  path: PropertyKey[],
  patches: Patches,
  inversePatches: Patches
) => {
  if (Object.is(previous, next)) return;
  if (
    !isPatchTraversable(previous) ||
    !isPatchTraversable(next) ||
    Array.isArray(previous) !== Array.isArray(next)
  ) {
    replaceAt(path, previous, next, patches, inversePatches);
    return;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    // A hole and an explicit `undefined` read the same but are not the same
    // array, and the difference cannot be described by an index patch: `add`
    // there means insert. Any change in which indexes exist is reported as a
    // replacement of the array.
    const holesMoved = (): boolean => {
      const length = Math.max(previous.length, next.length);
      for (let index = 0; index < length; index += 1) {
        const had = Object.prototype.hasOwnProperty.call(previous, index);
        const has = Object.prototype.hasOwnProperty.call(next, index);
        if (had !== has && index < Math.min(previous.length, next.length)) {
          return true;
        }
        if (!has && index < next.length && index >= previous.length)
          return true;
        if (!had && index < previous.length && index >= next.length)
          return true;
      }
      return false;
    };
    if (holesMoved()) {
      replaceAt(path, previous, next, patches, inversePatches);
      return;
    }
    const shared = Math.min(previous.length, next.length);
    for (let index = 0; index < shared; index += 1) {
      walk(
        previous[index],
        next[index],
        [...path, index],
        patches,
        inversePatches
      );
    }
    if (next.length > previous.length) {
      for (let index = previous.length; index < next.length; index += 1) {
        patches.push({ op: 'add', path: [...path, index], value: next[index] });
        inversePatches.unshift({ op: 'remove', path: [...path, index] });
      }
    } else if (next.length < previous.length) {
      // Truncation drops elements, and restoring a length cannot bring them
      // back, so the inverse carries the array it was.
      patches.push({
        op: 'replace',
        path: [...path, 'length'],
        value: next.length
      });
      inversePatches.unshift({
        op: 'replace',
        path: [...path],
        value: previous
      });
    }
  }

  const before = previous as Record<PropertyKey, unknown>;
  const after = next as Record<PropertyKey, unknown>;
  // Reached for arrays too, once their indexes have been compared: an array can
  // carry ordinary and symbol properties, and losing them is a change.
  const structural = Array.isArray(previous);
  const skip = (key: PropertyKey) =>
    structural && (key === 'length' || asArrayIndex(key) !== undefined);

  // A patch carries a value, not a descriptor, and says nothing about whether a
  // property is own or inherited. When either changes, replaying key-by-key
  // would reach the right values on the wrong shape, so the container is
  // replaced whole -- the same answer sparse arrays already get.
  const reshaped = () => {
    // The prototype is part of what the object is, and no patch names it.
    if (Object.getPrototypeOf(before) !== Object.getPrototypeOf(after)) {
      return true;
    }
    const keys = new Set([
      ...Reflect.ownKeys(before),
      ...Reflect.ownKeys(after)
    ]);
    for (const key of keys) {
      if (skip(key)) continue;
      const had = Object.getOwnPropertyDescriptor(before, key);
      const has = Object.getOwnPropertyDescriptor(after, key);
      // A patch carries a value: an ordinary property appearing or vanishing is
      // describable, but one that arrives non-enumerable, read-only or as an
      // accessor is not, and neither is one that cannot be deleted.
      if (!had || !has) {
        if ((!had && key in before) || (!has && key in after)) return true;
        const only = had ?? has!;
        if ('get' in only || 'set' in only) return true;
        if (!only.enumerable || !only.writable || !only.configurable) {
          return true;
        }
        continue;
      }
      if (
        had.enumerable !== has.enumerable ||
        had.writable !== has.writable ||
        had.configurable !== has.configurable ||
        had.get !== has.get ||
        had.set !== has.set
      ) {
        return true;
      }
      // An accessor survives nothing: applying any patch to this container
      // copies it, and a copy stores what the accessor gave rather than the
      // accessor. A read-only property cannot be assigned a new value at all.
      if ('get' in had || 'set' in had) return true;
      if (had.writable === false && !Object.is(had.value, has.value)) {
        return true;
      }
    }
    return false;
  };
  if (reshaped()) {
    replaceAt(path, previous, next, patches, inversePatches);
    return;
  }
  for (const key of Reflect.ownKeys(before)) {
    if (skip(key)) continue;
    if (!(key in after)) {
      patches.push({ op: 'remove', path: [...path, key] });
      inversePatches.unshift({
        op: 'add',
        path: [...path, key],
        value: before[key]
      });
      continue;
    }
    walk(before[key], after[key], [...path, key], patches, inversePatches);
  }
  for (const key of Reflect.ownKeys(after)) {
    if (skip(key) || key in before) continue;
    patches.push({ op: 'add', path: [...path, key], value: after[key] });
    inversePatches.unshift({ op: 'remove', path: [...path, key] });
  }
};

export const diffPatches = <T>(
  previous: T,
  next: T
): { patches: Patches; inversePatches: Patches } => {
  const patches: Patches = [];
  const inversePatches: Patches = [];
  walk(previous, next, [] as PropertyKey[], patches, inversePatches);
  return { patches, inversePatches };
};

/** The patch a single terminal write amounts to, without walking anything. */
export const writePatch = (
  path: PropertyKey[],
  previous: unknown,
  next: unknown
): { patch: Patch; inverse: Patch } => ({
  patch: { op: 'replace', path, value: next },
  inverse: { op: 'replace', path, value: previous }
});
