import {
  apply as applyWithMutative,
  create as createWithMutative,
  type Options,
  type Patches
} from 'mutative';
import type { MiddlewareStore } from './interface';

/** Null-prototype records are local data, not mutable atomic instances. */
export const markLocalState: Exclude<
  Options<true, false>['mark'],
  unknown[] | undefined
> = (value, types) =>
  value != null && Object.getPrototypeOf(value) === null
    ? types.immutable
    : undefined;

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
  if (needsRootSnapshot(currentState) || needsRootSnapshot(nextState)) {
    return createSnapshotPatches(currentState, nextState);
  }
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
  if (!source || typeof source !== 'object') {
    return [];
  }
  const keys: PropertyKey[] = Object.keys(source);
  for (const key of Object.getOwnPropertySymbols(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) keys.push(key);
  }
  return keys;
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

const cloneStateValue = <T>(
  source: T,
  seen: WeakMap<object, unknown>,
  preserveFunctions: boolean
): T => {
  if (typeof source !== 'object' || source === null) {
    return source;
  }
  const cached = seen.get(source);
  if (cached) {
    return cached as T;
  }
  const array = Array.isArray(source);
  const prototype = Object.getPrototypeOf(source);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    return source;
  }
  const target = (
    array ? new Array(source.length) : Object.create(prototype)
  ) as Record<PropertyKey, unknown>;
  seen.set(source, target);
  // Array indices include non-enumerable slots. Named extras and symbols
  // remain enumerable-only, matching the object replacement boundary.
  for (const key of array
    ? Reflect.ownKeys(source)
    : getOwnEnumerableKeys(source)) {
    const index = array && isArrayIndexKey(key);
    if (
      (typeof key === 'string' && isUnsafeKey(key)) ||
      (array &&
        !index &&
        !Object.prototype.propertyIsEnumerable.call(source, key))
    )
      continue;
    const value = (source as Record<PropertyKey, unknown>)[key];
    if (!preserveFunctions && !index && typeof value === 'function') continue;
    target[key] = cloneStateValue(value, seen, preserveFunctions);
  }
  return target as T;
};

export const sanitizeReplacementState = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => cloneStateValue(source, seen, false);

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

type PatchPathNode = {
  children?: Map<string, PatchPathNode>;
  /** A patch path ends here. */
  ends?: boolean;
};

/** Compare local state graphs, including identity leaves and alias topology. */
export const isSameStructure = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  const leftToRight = new WeakMap<object, object>();
  const rightToLeft = new WeakMap<object, object>();
  const pending: [unknown, unknown][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (
      typeof a !== 'object' ||
      a === null ||
      typeof b !== 'object' ||
      b === null
    ) {
      if (!Object.is(a, b)) return false;
      continue;
    }
    const prototype = Object.getPrototypeOf(a);
    if (prototype !== Object.getPrototypeOf(b)) return false;
    const array = Array.isArray(a);
    if (array !== Array.isArray(b)) return false;
    if (!array && prototype !== Object.prototype && prototype !== null) {
      if (!Object.is(a, b)) return false;
      continue;
    }
    if (array && a.length !== (b as unknown[]).length) return false;
    if (leftToRight.has(a) || rightToLeft.has(b)) {
      if (leftToRight.get(a) !== b || rightToLeft.get(b) !== a) return false;
      continue;
    }
    leftToRight.set(a, b);
    rightToLeft.set(b, a);
    // Even an identical subtree must be indexed: a node inside it may also
    // occur through a different, changed path on just one side.
    const keys = getOwnEnumerableKeys(a);
    if (keys.length !== getOwnEnumerableKeys(b).length) return false;
    for (const key of keys) {
      if (!Object.prototype.propertyIsEnumerable.call(b, key)) return false;
      pending.push([
        (a as Record<PropertyKey, unknown>)[key],
        (b as Record<PropertyKey, unknown>)[key]
      ]);
    }
  }
  return true;
};

/**
 * Mutative's per-patch value cloning describes trees. A full root value is
 * needed for graphs, atomic objects, symbols and array shapes that cloning
 * would split, recurse through, or silently normalize. Root replacement is a
 * standard patch and can also be replayed by consumers using Mutative itself.
 */
export const needsRootSnapshot = (state: unknown): boolean => {
  const seen = new WeakSet<object>();
  const pending = [state];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value !== 'object' || value === null) continue;
    if (seen.has(value)) return true;
    seen.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype) {
      return true;
    }
    const keys = getOwnEnumerableKeys(value);
    if (array && keys.length !== value.length) return true;
    for (const key of keys) {
      if (typeof key === 'symbol' || (array && !isArrayIndexKey(key))) {
        return true;
      }
      pending.push((value as Record<PropertyKey, unknown>)[key]);
    }
  }
  return false;
};

export const createSnapshotPatches = (before: unknown, after: unknown) => ({
  patches: Object.is(before, after)
    ? []
    : [{ op: 'replace' as const, path: [], value: after }],
  inversePatches: Object.is(before, after)
    ? []
    : [{ op: 'replace' as const, path: [], value: before }]
});

export const inverseNeedsDerivation = (patches: Patches) => {
  if (patches.length < 2) return false;
  // A trie detects overlapping paths in linear path-length time.
  const root: PatchPathNode = {};
  for (const patch of patches) {
    let node = root;
    let existing = true;
    for (const segment of normalizePatchPath(patch.path)) {
      // This patch writes inside a container replaced by an earlier patch.
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
    // This patch replaces a container changed by an earlier patch.
    if (existing && node.children?.size) {
      return true;
    }
    node.ends = true;
  }
  return false;
};

/** Derive an inverse at its actual base; graphs require a complete snapshot. */
export const createInversePatches = <T>(
  state: T,
  patches: Patches
): Patches => {
  if (
    patches.length &&
    (needsRootSnapshot(state) ||
      needsRootSnapshot(patches.map((patch) => patch.value)))
  ) {
    return [
      { op: 'replace', path: [], value: sanitizeReplacementState(state) }
    ];
  }
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
      // Restoring length alone cannot restore the elements truncation removed.
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
    current = applyWithMutative(current as any, [patch] as Patches, {
      mark: markLocalState
    });
  }
  return inverse;
};

/** Apply an intermediate immutable transition without publishing a store update. */
export const applyPatches = <T>(state: T, patches: Patches): T => {
  const last = patches[patches.length - 1];
  if (last?.op === 'replace' && !last.path.length) return last.value as T;
  const values = patches.flatMap((patch) =>
    typeof patch.value === 'object' && patch.value !== null ? [patch.value] : []
  );
  if (!values.length || !needsRootSnapshot(values)) {
    return applyWithMutative(state as any, patches, {
      mark: markLocalState
    }) as T;
  }
  // Incoming non-root patches can carry graphs too. Clone their values with
  // one memo, then assign them into a draft without Mutative's tree-only clone.
  assertSafePatches(patches, 'applyPatches()');
  const seen = new WeakMap<object, unknown>();
  let start = 0;
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index];
    if (!patch.path.length && patch.op === 'replace') {
      state = sanitizeReplacementState(patch.value, seen) as T;
      start = index + 1;
      break;
    }
  }
  if (start === patches.length) return state;
  return createWithMutative(
    state as any,
    (draft: any) => {
      for (const patch of patches.slice(start)) {
        const path = normalizePatchPath(patch.path);
        let parent = draft;
        for (const key of path.slice(0, -1)) {
          parent =
            parent instanceof Map
              ? parent.get(key)
              : parent instanceof Set
                ? [...parent][Number(key)]
                : parent[key];
          if (parent === null || typeof parent !== 'object') {
            throw new Error(
              `Cannot apply patch at '${path.map(String).join('/')}'.`
            );
          }
        }
        const key = path[path.length - 1];
        const remove = patch.op === 'remove';
        if (!remove && patch.op !== 'add' && patch.op !== 'replace') {
          throw new Error(`Unsupported patch operation: ${patch.op}.`);
        }
        const value = sanitizeReplacementState(patch.value, seen);
        if (parent instanceof Map) {
          if (remove) parent.delete(key);
          else parent.set(key, value);
        } else if (parent instanceof Set) {
          if (patch.op === 'replace')
            throw new Error('Cannot apply replace patch to set.');
          if (remove) parent.delete(patch.value);
          else parent.add(value);
        } else if (Array.isArray(parent) && patch.op !== 'replace') {
          const index = key === '-' ? parent.length : Number(key);
          if (remove) parent.splice(index, 1);
          else parent.splice(index, 0, value);
        } else if (remove) {
          delete parent[key];
        } else {
          parent[key] = value;
        }
      }
    },
    { mark: markLocalState }
  ) as T;
};

export const sanitizeInitialStateValue = <T>(
  source: T,
  seen = new WeakMap<object, unknown>()
): T => cloneStateValue(source, seen, true);

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
