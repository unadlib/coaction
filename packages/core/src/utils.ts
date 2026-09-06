import { apply as applyWithMutative, type Patches } from 'mutative';
import type { MiddlewareStore } from './interface';

const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  return x !== x && y !== y;
};

export const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'prototype' || key === 'constructor';

export const isUnsafePathSegment = (segment: unknown) =>
  typeof segment === 'string' && isUnsafeKey(segment);

export class UnsafePatchPathError extends Error {
  name = 'UnsafePatchPathError';
}

export class StateSchemaError extends Error {
  name = 'StateSchemaError';
}

export const isStateSchemaError = (error: unknown): error is StateSchemaError =>
  error instanceof StateSchemaError ||
  (error instanceof Error && error.name === 'StateSchemaError');

export type StateSchema = {
  rootKeys: Set<PropertyKey>;
  sliceKeys?: Map<PropertyKey, Set<PropertyKey>>;
};

export const hasUnsafePatchPath = (path: unknown) => {
  const segments = Array.isArray(path)
    ? path
    : typeof path === 'string'
      ? path
          .split('/')
          .filter(Boolean)
          .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
      : [];
  return segments.some(isUnsafePathSegment);
};

const formatPatchPath = (path: unknown) =>
  Array.isArray(path)
    ? path.map((segment) => String(segment)).join('.')
    : String(path);

const getUnsafePatchPaths = <T extends { path: unknown }>(
  patches: T[] | undefined
) => patches?.filter((patch) => hasUnsafePatchPath(patch.path)) ?? [];

export const assertSafePatches = <T extends { path: unknown }>(
  patches: T[] | undefined,
  source = 'patches'
) => {
  const unsafePatches = getUnsafePatchPaths(patches);
  if (!unsafePatches.length) {
    return;
  }
  const paths = unsafePatches
    .map((patch) => `'${formatPatchPath(patch.path)}'`)
    .join(', ');
  throw new UnsafePatchPathError(
    `Unsafe patch path${unsafePatches.length > 1 ? 's' : ''} ${paths} cannot be applied from ${source}.`
  );
};

const warnDroppedUnsafePatches = <T extends { path: unknown }>(
  unsafePatches: T[],
  source: string
) => {
  if (process.env.NODE_ENV !== 'development' || !unsafePatches.length) {
    return;
  }
  const paths = unsafePatches
    .map((patch) => `'${formatPatchPath(patch.path)}'`)
    .join(', ');
  console.warn(
    `Coaction dropped unsafe patch path${unsafePatches.length > 1 ? 's' : ''} ${paths} from ${source}.`
  );
};

export const sanitizePatches = <T extends { path: unknown; value?: unknown }>(
  patches: T[] | undefined,
  options: {
    source?: string;
    warnOnDropped?: boolean;
  } = {}
) => {
  if (options.warnOnDropped) {
    warnDroppedUnsafePatches(
      getUnsafePatchPaths(patches),
      options.source ?? 'patches'
    );
  }
  const seen = new WeakMap<object, unknown>();
  return patches
    ?.filter((patch) => !hasUnsafePatchPath(patch.path))
    .map((patch) =>
      Object.prototype.hasOwnProperty.call(patch, 'value')
        ? {
            ...patch,
            value: sanitizeReplacementState(patch.value, seen)
          }
        : patch
    );
};

export const sanitizeCheckedPatches = (
  patches: Patches | undefined,
  source: string
): Patches => {
  assertSafePatches(patches, source);
  return (sanitizePatches(patches) ?? []) as Patches;
};

export type RootReplacementPatch = {
  op: 'add' | 'remove' | 'replace';
  path: PropertyKey[];
  value?: unknown;
};

export const createRootReplacementPatches = (
  currentState: Record<PropertyKey, unknown>,
  nextState: Record<PropertyKey, unknown>
) => {
  const patches: RootReplacementPatch[] = [];
  const inversePatches: RootReplacementPatch[] = [];
  const nextKeys = new Set(getOwnEnumerableKeys(nextState));
  for (const key of getOwnEnumerableKeys(currentState)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    if (nextKeys.has(key)) {
      continue;
    }
    patches.push({
      op: 'remove',
      path: [key]
    });
    inversePatches.push({
      op: 'add',
      path: [key],
      value: currentState[key]
    });
  }
  for (const key of nextKeys) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(currentState, key)) {
      patches.push({
        op: 'add',
        path: [key],
        value: nextState[key]
      });
      inversePatches.push({
        op: 'remove',
        path: [key]
      });
      continue;
    }
    if (Object.is(currentState[key], nextState[key])) {
      continue;
    }
    patches.push({
      op: 'replace',
      path: [key],
      value: nextState[key]
    });
    inversePatches.push({
      op: 'replace',
      path: [key],
      value: currentState[key]
    });
  }
  return {
    patches,
    inversePatches
  };
};

const createRootStateFromPatches = <T extends object>(
  currentState: T,
  patches: Patches
): T | undefined => {
  const nextState = sanitizeReplacementState(currentState) as Record<
    PropertyKey,
    unknown
  >;
  const seen = new WeakMap<object, unknown>();
  for (const patch of patches) {
    if (
      !Array.isArray(patch.path) ||
      patch.path.length !== 1 ||
      !['add', 'remove', 'replace'].includes(patch.op)
    ) {
      return undefined;
    }
    const key = patch.path[0] as PropertyKey;
    if (patch.op === 'remove') {
      delete nextState[key];
      continue;
    }
    nextState[key] = sanitizeReplacementState(
      (patch as { value: unknown }).value,
      seen
    );
  }
  return nextState as T;
};

export const applyRootReplacementWithPatches = <T extends object>(
  store: MiddlewareStore<T>,
  nextState: Record<PropertyKey, unknown>,
  options: {
    applyExactReplacement?: (state: T) => void;
  } = {}
): [T, Patches, Patches] => {
  const { patches, inversePatches } = createRootReplacementPatches(
    store.getPureState() as Record<PropertyKey, unknown>,
    nextState
  );
  const finalPatches = store.patch
    ? store.patch({
        patches: patches as any,
        inversePatches: inversePatches as any
      })
    : {
        patches: patches as any,
        inversePatches: inversePatches as any
      };
  const safePatches = sanitizeCheckedPatches(
    finalPatches.patches,
    'store.patch()'
  );
  const safeInversePatches = sanitizeCheckedPatches(
    finalPatches.inversePatches,
    'store.patch() inverse patches'
  );
  if (safePatches.length) {
    const applyExactReplacement = options.applyExactReplacement;
    const exactReplacementState = applyExactReplacement
      ? createRootStateFromPatches(store.getPureState(), safePatches)
      : undefined;
    if (applyExactReplacement && exactReplacementState) {
      applyExactReplacement(exactReplacementState);
    } else {
      store.apply(store.getPureState(), safePatches);
    }
  }
  return [store.getPureState(), safePatches, safeInversePatches];
};

export const setOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown
) => {
  if (typeof key === 'string' && isUnsafeKey(key)) {
    return;
  }
  target[key] = value;
};

export const getOwnEnumerableKeys = (source: unknown) => {
  if (typeof source !== 'object' || source === null) {
    return [];
  }
  return Reflect.ownKeys(source).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(source, key)
  );
};

const getOwnSchemaKeys = (source: unknown) => {
  if (typeof source !== 'object' || source === null) {
    return [];
  }
  return Reflect.ownKeys(source).filter(
    (key) => !(typeof key === 'string' && isUnsafeKey(key))
  );
};

const formatSchemaPath = (path: PropertyKey[]) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

const assertKnownSchemaKey = (
  knownKeys: Set<PropertyKey>,
  key: PropertyKey,
  path: PropertyKey[]
) => {
  if (typeof key === 'string' && isUnsafeKey(key)) {
    return;
  }
  if (knownKeys.has(key)) {
    return;
  }
  throw new StateSchemaError(
    `Unknown state key '${formatSchemaPath([...path, key])}' cannot be added after store initialization. Coaction state schema is fixed.`
  );
};

const assertKnownSliceObject = (key: PropertyKey, value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    return;
  }
  throw new StateSchemaError(
    `State slice '${String(key)}' must remain an object after store initialization. Coaction slice schema is fixed.`
  );
};

const assertKnownSlicePresent = (
  source: Record<PropertyKey, unknown>,
  key: PropertyKey
) => {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return;
  }
  throw new StateSchemaError(
    `State slice '${String(key)}' cannot be removed after store initialization. Coaction slice schema is fixed.`
  );
};

export const createStateSchema = (
  rootState: unknown,
  isSliceStore: boolean
): StateSchema => {
  const rootKeys = new Set(getOwnSchemaKeys(rootState));
  if (!isSliceStore) {
    return {
      rootKeys
    };
  }
  const sliceKeys = new Map<PropertyKey, Set<PropertyKey>>();
  if (typeof rootState === 'object' && rootState !== null) {
    const rootRecord = rootState as Record<PropertyKey, unknown>;
    rootKeys.forEach((key) => {
      const slice = rootRecord[key];
      if (typeof slice === 'object' && slice !== null) {
        sliceKeys.set(key, new Set(getOwnSchemaKeys(slice)));
      }
    });
  }
  return {
    rootKeys,
    sliceKeys
  };
};

export const assertKnownStateShape = (
  source: unknown,
  rootState: unknown,
  schema: StateSchema | undefined,
  isSliceStore: boolean,
  options: {
    requireSliceRoots?: boolean;
  } = {}
) => {
  if (typeof source !== 'object' || source === null) {
    return;
  }
  const rootKeys = schema?.rootKeys ?? new Set(getOwnSchemaKeys(rootState));
  const sourceRecord = source as Record<PropertyKey, unknown>;
  const knownSliceEntries = schema?.sliceKeys;
  if (isSliceStore && options.requireSliceRoots && knownSliceEntries) {
    knownSliceEntries.forEach((_, key) => {
      assertKnownSlicePresent(sourceRecord, key);
    });
  }
  for (const key of getOwnEnumerableKeys(source)) {
    assertKnownSchemaKey(rootKeys, key, []);
    if (!isSliceStore) {
      continue;
    }
    const slice = sourceRecord[key];
    const knownSliceKeys =
      schema?.sliceKeys?.get(key) ??
      (typeof rootState === 'object' &&
      rootState !== null &&
      typeof (rootState as Record<PropertyKey, unknown>)[key] === 'object' &&
      (rootState as Record<PropertyKey, unknown>)[key] !== null
        ? new Set(
            getOwnSchemaKeys((rootState as Record<PropertyKey, unknown>)[key])
          )
        : undefined);
    if (!knownSliceKeys) {
      continue;
    }
    assertKnownSliceObject(key, slice);
    for (const sliceKey of getOwnEnumerableKeys(slice)) {
      assertKnownSchemaKey(knownSliceKeys, sliceKey, [key]);
    }
  }
};

const isArrayIndexKey = (key: PropertyKey) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  );
};

export const assignOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>,
  seen = new WeakMap<object, unknown>()
) => {
  if (!seen.has(source)) {
    seen.set(source, target);
  }
  for (const key of getOwnEnumerableKeys(source)) {
    setOwnEnumerable(target, key, sanitizeReplacementState(source[key], seen));
  }
};

export const replaceOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  const seen = new WeakMap<object, unknown>();
  seen.set(source, target);
  const nextKeys = new Set<PropertyKey>();
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    if (typeof source[key] === 'function') {
      continue;
    }
    nextKeys.add(key);
  }
  for (const key of getOwnEnumerableKeys(target)) {
    if (!nextKeys.has(key)) {
      delete target[key];
    }
  }
  nextKeys.forEach((key) => {
    setOwnEnumerable(target, key, sanitizeReplacementState(source[key], seen));
  });
};

/**
 * Copy own enumerable keys without re-sanitizing nested values.
 *
 * @remarks
 * Use this for state the store already owns and already sanitized on the way
 * in. {@link assignOwnEnumerable} deep-clones every value through
 * {@link sanitizeReplacementState}, which is required for untrusted incoming
 * payloads but makes copying the current root O(total state size) on every
 * commit. Nested values keep their identity here, matching the structural
 * sharing the Mutative draft path already relies on.
 */
export const shallowCloneOwnEnumerable = <
  T extends Record<PropertyKey, unknown>
>(
  source: T
) => {
  const target = {} as T;
  for (const key of getOwnEnumerableKeys(source)) {
    setOwnEnumerable(target, key, source[key]);
  }
  return target;
};

export const cloneOwnEnumerable = <T extends Record<PropertyKey, unknown>>(
  source: T
) => {
  const target = {} as T;
  assignOwnEnumerable(target, source);
  return target;
};

export const sanitizeReplacementState = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  const cached = seen.get(source);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(source)) {
    const target: unknown[] = [];
    target.length = source.length;
    seen.set(source, target);
    for (let index = 0; index < source.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(source, index)) {
        target[index] = sanitizeReplacementState(source[index], seen);
      }
    }
    for (const key of getOwnEnumerableKeys(source)) {
      if (
        isArrayIndexKey(key) ||
        (typeof key === 'string' && isUnsafeKey(key))
      ) {
        continue;
      }
      const value = (source as Record<PropertyKey, unknown>)[key];
      if (typeof value === 'function') {
        continue;
      }
      setOwnEnumerable(
        target as unknown as Record<PropertyKey, unknown>,
        key,
        sanitizeReplacementState(value, seen)
      );
    }
    return target as T;
  }
  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    return source;
  }
  const target = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(source, target);
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    const value = (source as Record<PropertyKey, unknown>)[key];
    if (typeof value === 'function') {
      continue;
    }
    setOwnEnumerable(target, key, sanitizeReplacementState(value, seen));
  }
  return target as T;
};

const normalizePatchPath = (path: unknown): PropertyKey[] => {
  if (Array.isArray(path)) {
    return [...path] as PropertyKey[];
  }
  if (typeof path !== 'string' || path === '') {
    return [];
  }
  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
};

const readPatchTarget = (root: unknown, path: readonly PropertyKey[]) => {
  if (!path.length) {
    return { exists: true, parent: undefined, value: root };
  }
  let parent = root as any;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (parent === null || parent === undefined) {
      return { exists: false, parent: undefined, value: undefined };
    }
    parent = parent[path[index] as any];
  }
  if (parent === null || parent === undefined) {
    return { exists: false, parent: undefined, value: undefined };
  }
  const key = path[path.length - 1];
  return {
    exists: Object.prototype.hasOwnProperty.call(parent, key),
    parent,
    value: parent[key as any]
  };
};

/**
 * Recompute an exact inverse patch list for `patches` against a new base.
 *
 * This is intentionally path-local: it clones only values removed/replaced by
 * the forward transition instead of snapshotting the whole store. Local-first
 * rebase can therefore refresh optimistic inverses without O(state-size)
 * cloning for every pending mutation.
 */
/**
 * Whether mutative's inverse pair has to be rebuilt before it can be applied.
 *
 * `inversePatches[i]` undoes `patches[i]`, in that order, so applying the array
 * as it comes only works while the patches are independent. A later patch that
 * replaces the container of an earlier one -- an array element written, then
 * the array shifted -- leaves the earlier undo writing into something that is
 * gone. Deriving the inverse instead always works but flattens the shared
 * references mutative's keeps, so it is used only here.
 */
type PatchPathNode = {
  children?: Map<string, PatchPathNode>;
  /** A patch path ends here. */
  ends?: boolean;
};

export const inverseNeedsDerivation = (patches: Patches) => {
  if (patches.length < 2) return false;
  // Paths go into a trie as they are read, and each one asks on the way in
  // whether anything already there went deeper through it. That is the same
  // question as "is this a proper prefix of an earlier path", answered once per
  // segment instead of against every earlier patch: a bulk array edit produces
  // thousands of patches, and comparing each against all of its predecessors
  // made the check cost more than the update it was checking.
  const root: PatchPathNode = {};
  for (const patch of patches) {
    let node = root;
    let existing = true;
    for (const segment of normalizePatchPath(patch.path)) {
      // An earlier patch ends above this one: this patch writes inside what
      // that one replaced. Undoing them in order restores the container whole
      // and then writes into it again, which for an `add` is an element too
      // many.
      if (node.ends) {
        return true;
      }
      const key = String(segment);
      node.children ??= new Map();
      let next = node.children.get(key);
      if (!next) {
        existing = false;
        next = {};
        node.children.set(key, next);
      }
      node = next;
    }
    // Reached entirely through nodes that were already there, and something
    // continues past it: an earlier patch is inside what this one replaces.
    if (existing && node.children?.size) {
      return true;
    }
    node.ends = true;
  }
  return false;
};

export const createInversePatches = <T>(
  state: T,
  patches: Patches
): Patches => {
  let current = state as unknown;
  const inverse: Patches = [];
  for (const patch of patches) {
    const path = normalizePatchPath(patch.path);
    const target = readPatchTarget(current, path);
    const inversePath = [...path];
    if (patch.op === 'add') {
      const parentIsArray = Array.isArray(target.parent);
      if (!parentIsArray && target.exists) {
        inverse.unshift({
          op: 'replace',
          path: inversePath,
          value: sanitizeReplacementState(target.value)
        } as Patches[number]);
      } else {
        inverse.unshift({ op: 'remove', path: inversePath } as Patches[number]);
      }
    } else if (patch.op === 'remove') {
      inverse.unshift({
        op: 'add',
        path: inversePath,
        value: sanitizeReplacementState(target.value)
      } as Patches[number]);
    } else if (
      path[path.length - 1] === 'length' &&
      Array.isArray(target.parent) &&
      typeof patch.value === 'number' &&
      patch.value < (target.parent as unknown[]).length
    ) {
      // Shortening an array through `length` drops elements without a patch
      // per index. Putting the length back would leave holes where they were,
      // so the inverse carries the array itself. Growing through `length` only
      // appends holes, and restoring the length does undo that.
      inverse.unshift({
        op: 'replace',
        path: path.slice(0, -1),
        value: sanitizeReplacementState(target.parent)
      } as Patches[number]);
    } else {
      inverse.unshift({
        op: 'replace',
        path: inversePath,
        value: sanitizeReplacementState(target.value)
      } as Patches[number]);
    }
    current = applyWithMutative(current as any, [patch] as Patches);
  }
  return inverse;
};

/**
 * Apply patches to an immutable state value and return the result.
 *
 * A middleware that has to work out a multi-step transition before committing
 * it -- a sync rebase computing rollback, remote patches and replay as a single
 * commit -- needs the intermediate states without the store ever showing them.
 */
export const applyPatches = <T>(state: T, patches: Patches): T =>
  applyWithMutative(state as any, patches) as T;

export const sanitizeInitialStateValue = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  const cached = seen.get(source);
  if (cached) {
    return cached as T;
  }
  if (Array.isArray(source)) {
    const target: unknown[] = [];
    target.length = source.length;
    seen.set(source, target);
    for (let index = 0; index < source.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(source, index)) {
        target[index] = sanitizeInitialStateValue(source[index], seen);
      }
    }
    for (const key of getOwnEnumerableKeys(source)) {
      if (
        isArrayIndexKey(key) ||
        (typeof key === 'string' && isUnsafeKey(key))
      ) {
        continue;
      }
      setOwnEnumerable(
        target as unknown as Record<PropertyKey, unknown>,
        key,
        sanitizeInitialStateValue(
          (source as Record<PropertyKey, unknown>)[key],
          seen
        )
      );
    }
    return target as T;
  }
  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    return source;
  }
  const target = Object.create(prototype) as Record<PropertyKey, unknown>;
  seen.set(source, target);
  for (const key of getOwnEnumerableKeys(source)) {
    if (typeof key === 'string' && isUnsafeKey(key)) {
      continue;
    }
    setOwnEnumerable(
      target,
      key,
      sanitizeInitialStateValue(
        (source as Record<PropertyKey, unknown>)[key],
        seen
      )
    );
  }
  return target as T;
};

export const areShallowEqualWithArray = (
  prev: any[] | null | IArguments,
  next: any[] | null | IArguments
) => {
  if (prev === null || next === null || prev.length !== next.length) {
    return false;
  }
  const { length } = prev;
  for (let i = 0; i < length; i += 1) {
    if (
      Object.prototype.hasOwnProperty.call(prev, i) !==
      Object.prototype.hasOwnProperty.call(next, i)
    ) {
      return false;
    }
    if (!isEqual(prev[i], next[i])) {
      return false;
    }
  }
  return true;
};

export const mergeObject = (target: any, source: any, isSlice?: boolean) => {
  if (isSlice) {
    if (typeof source === 'object' && source !== null) {
      for (const key of getOwnEnumerableKeys(source)) {
        if (typeof key === 'string' && isUnsafeKey(key)) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
          continue;
        }
        const sourceValue = source[key];
        if (typeof sourceValue !== 'object' || sourceValue === null) {
          continue;
        }
        const targetValue = target[key];
        if (typeof targetValue === 'object' && targetValue !== null) {
          assignOwnEnumerable(targetValue, sourceValue);
        }
      }
    }
  } else {
    if (typeof source === 'object' && source !== null) {
      assignOwnEnumerable(target, source);
    }
  }
};

export const uuid = () => {
  let timestamp = new Date().getTime();
  const uuidTemplate = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  const uuid = uuidTemplate.replace(/[xy]/g, (char) => {
    const randomNum = ((timestamp + Math.random() * 16) % 16) | 0;
    timestamp = Math.floor(timestamp / 16);
    return (char === 'x' ? randomNum : (randomNum & 0x3) | 0x8).toString(16);
  });
  return uuid;
};
