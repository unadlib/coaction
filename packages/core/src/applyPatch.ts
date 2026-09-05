import { asArrayIndex, isPatchTraversable } from './patch';
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
const asSegments = (path: Patch['path']): PropertyKey[] => {
  if (Array.isArray(path)) return path;
  if (path === '') return [];
  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
};

/**
 * A patch path went into something a patch cannot describe the inside of.
 *
 * Plain objects and dense arrays are what a Coaction transition traverses.
 * Anything else -- a `Map`, a `Set`, a `Date`, an instance of a class -- is a
 * leaf: it can be replaced whole, and its interior has no path. Spreading one
 * into a plain object would silently produce a different thing, which is what
 * this replaces.
 */
export class UnsupportedPatchContainerError extends TypeError {
  constructor(
    readonly container: unknown,
    readonly path: readonly PropertyKey[]
  ) {
    const described =
      container === null
        ? 'null'
        : typeof container === 'object'
          ? ((container as object).constructor?.name ?? 'an object')
          : typeof container;
    super(
      `A patch cannot describe the inside of ${described}. Replace it whole instead. Path: ${path.length ? path.map(String).join('.') : '<root>'}.`
    );
    this.name = 'UnsupportedPatchContainerError';
  }
}

/**
 * Copy without losing what the value was: descriptors rather than a spread or
 * `slice`, so a sparse array keeps its holes, an array keeps the properties
 * hung off it, and a null-prototype object stays one.
 */
const shallowCopy = (value: unknown, path: readonly PropertyKey[]) => {
  if (!isPatchTraversable(value)) {
    throw new UnsupportedPatchContainerError(value, path);
  }
  const source = value as Record<PropertyKey, unknown>;
  if (Array.isArray(source)) {
    // Descriptors, so holes survive and the ordinary and symbol properties an
    // array can carry come with it.
    const copy: unknown[] = [];
    Object.defineProperties(copy, Object.getOwnPropertyDescriptors(source));
    return copy as unknown as Record<PropertyKey, unknown>;
  }
  const copy = Object.create(Object.getPrototypeOf(source)) as Record<
    PropertyKey,
    unknown
  >;
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    if ('get' in descriptor || 'set' in descriptor) {
      // Read an accessor once and store what it gave: carrying the accessor
      // across would leave the copy reading from the original.
      Object.defineProperty(copy, key, {
        value: Reflect.get(source, key),
        writable: true,
        enumerable: descriptor.enumerable,
        configurable: true
      });
      continue;
    }
    // Descriptors rather than assignment: a non-enumerable property is state
    // Coaction keeps, and assignment drops it.
    Object.defineProperty(copy, key, descriptor);
  }
  return copy;
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
  segments: PropertyKey[],
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
    copy = shallowCopy(node, segments.slice(0, depth)) as Record<
      PropertyKey,
      unknown
    >;
    owned.add(copy);
  }
  if (depth < segments.length - 1) {
    // Read the child off the copy, not the original: an earlier patch in this
    // batch may already have replaced it.
    copy[key] = applyAt(copy[key], segments, depth + 1, patch, owned);
    return copy;
  }
  if (Array.isArray(copy)) {
    if (key === 'length') {
      copy.length = patch.value as number;
      return copy;
    }
    const index = asArrayIndex(key);
    if (index !== undefined) {
      // An index names a position in a sequence, so adding and removing shift
      // the entries after it -- except past the end, where there is no
      // sequence to shift and the assignment extends the array instead.
      if (patch.op === 'add') {
        if (index >= copy.length) copy[index] = patch.value;
        else copy.splice(index, 0, patch.value);
      } else if (patch.op === 'remove') {
        copy.splice(index, 1);
      } else {
        copy[index] = patch.value;
      }
      return copy;
    }
    // Anything else on an array is an ordinary property, which arrays can carry.
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
