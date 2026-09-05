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
const isTraversable = (value: unknown) => {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** `0`, `1`, `2`... A property that merely looks numeric is an ordinary key. */
const isArrayIndex = (key: PropertyKey) =>
  typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);

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
    !isTraversable(previous) ||
    !isTraversable(next) ||
    Array.isArray(previous) !== Array.isArray(next)
  ) {
    replaceAt(path, previous, next, patches, inversePatches);
    return;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
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
    structural && (key === 'length' || isArrayIndex(key));
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
