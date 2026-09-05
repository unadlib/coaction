import type { Patch, Patches } from './patch';
import { isUnsafeKey } from './utils';

/**
 * Apply patches to an immutable value, copying only along the paths they touch.
 *
 * Coaction decides what a patch means -- how a truncating `length` write
 * behaves, what inserting at an index does to the entries after it, which keys
 * are refused -- and those decisions are what history, sync and the transport
 * all depend on. Reading them out of whichever producer generated the patch
 * left the contract defined somewhere else.
 *
 * Everything outside the touched paths keeps its identity, which is what makes
 * reference comparison meaningful for readers downstream.
 */
const asSegments = (path: Patch['path']): (string | number)[] => {
  if (Array.isArray(path)) return path;
  if (path === '') return [];
  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
};

const shallowCopy = (value: unknown) => {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === 'object' && value !== null) {
    return { ...(value as Record<PropertyKey, unknown>) };
  }
  throw new TypeError(
    `Cannot apply a patch through ${value === null ? 'null' : typeof value}.`
  );
};

/**
 * Nodes copied during this batch, which nothing outside it can observe yet.
 *
 * Without this, every patch copies the whole path from the root again: a pull
 * returning one patch per record re-copies the collection once per record, so
 * the cost is the number of patches times the size of what they share. Copying
 * a container at most once per batch makes it the number of patches plus the
 * number of containers.
 */
const applyAt = (
  node: unknown,
  segments: (string | number)[],
  depth: number,
  patch: Patch,
  owned: WeakSet<object>
): unknown => {
  if (depth === segments.length) {
    return patch.op === 'remove' ? undefined : patch.value;
  }
  const key = segments[depth];
  if (typeof key === 'string' && isUnsafeKey(key)) {
    throw new TypeError(`Unsafe patch path segment "${key}".`);
  }
  let copy: Record<PropertyKey, unknown>;
  if (typeof node === 'object' && node !== null && owned.has(node)) {
    copy = node as Record<PropertyKey, unknown>;
  } else {
    copy = shallowCopy(node) as Record<PropertyKey, unknown>;
    owned.add(copy);
  }
  if (depth < segments.length - 1) {
    // Read the child off the copy, not the original: an earlier patch in this
    // batch may already have replaced it.
    copy[key] = applyAt(copy[key], segments, depth + 1, patch, owned);
    return copy;
  }
  if (Array.isArray(copy)) {
    // An index names a position in a sequence, so adding and removing shift the
    // entries after it rather than leaving a hole.
    if (key === 'length') {
      copy.length = patch.value as number;
      return copy;
    }
    const index = Number(key);
    if (patch.op === 'add') copy.splice(index, 0, patch.value);
    else if (patch.op === 'remove') copy.splice(index, 1);
    else copy[index] = patch.value;
    return copy;
  }
  if (patch.op === 'remove') delete copy[key];
  else copy[key] = patch.value;
  return copy;
};

export const applyPatchesTo = <T>(state: T, patches: Patches): T => {
  if (!patches.length) return state;
  const owned = new WeakSet<object>();
  let result: unknown = state;
  for (const patch of patches) {
    result = applyAt(result, asSegments(patch.path), 0, patch, owned);
  }
  return result as T;
};
