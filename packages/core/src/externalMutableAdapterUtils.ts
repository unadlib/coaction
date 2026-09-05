import type { Store } from './interface';
import { apply as applyWithMutative } from 'mutative';
import type { Patches } from './patch';
import {
  assertSafePatches,
  isUnsafeKey,
  sanitizeReplacementState,
  StateSchemaError
} from './utils';

export const getMutableAdapterOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

export const isMutableAdapterUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' && isUnsafeKey(key);

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

const isObjectRecord = (value: object) =>
  Object.prototype.toString.call(value) === '[object Object]';

export const assertCanSetMutableAdapterPublicStateKey = (
  publicState: Record<PropertyKey, unknown>,
  key: PropertyKey
) => {
  if (Object.prototype.hasOwnProperty.call(publicState, key)) {
    return;
  }
  if (Object.isExtensible(publicState)) {
    return;
  }
  throw new StateSchemaError(
    `Unknown state key '${String(key)}' cannot be added after store initialization. Coaction state schema is fixed.`
  );
};

const ensureMutableAdapterRawDescriptor = (
  rawState: Record<PropertyKey, unknown>,
  mutableState: Record<PropertyKey, unknown>,
  publicState: Record<PropertyKey, unknown>,
  key: PropertyKey
) => {
  if (rawState === mutableState) {
    return;
  }
  const rawDescriptor = Object.getOwnPropertyDescriptor(rawState, key);
  if (rawDescriptor?.get && rawDescriptor.set) {
    return;
  }
  const publicDescriptor = Object.getOwnPropertyDescriptor(publicState, key);
  if (!publicDescriptor || rawDescriptor?.configurable === false) {
    return;
  }
  Object.defineProperty(rawState, key, {
    get: () => mutableState[key],
    set: (value) => {
      mutableState[key] = value;
    },
    configurable: true,
    enumerable: publicDescriptor.enumerable
  });
};

export const replaceMutableAdapterState = (
  rawState: Record<PropertyKey, unknown>,
  mutableState: Record<PropertyKey, unknown>,
  publicState: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  const nextKeys = new Set<PropertyKey>();
  for (const key of getMutableAdapterOwnEnumerableKeys(source)) {
    if (isMutableAdapterUnsafeKey(key)) {
      continue;
    }
    if (typeof source[key] === 'function') {
      continue;
    }
    nextKeys.add(key);
  }
  nextKeys.forEach((key) => {
    assertCanSetMutableAdapterPublicStateKey(publicState, key);
  });
  for (const key of getMutableAdapterOwnEnumerableKeys(rawState)) {
    if (isMutableAdapterUnsafeKey(key)) {
      delete rawState[key];
      delete mutableState[key];
      continue;
    }
    if (typeof rawState[key] === 'function') {
      continue;
    }
    if (!nextKeys.has(key)) {
      delete rawState[key];
      delete mutableState[key];
    }
  }
  const rawSeen = new WeakMap<object, unknown>();
  const mutableSeen = new WeakMap<object, unknown>();
  const publicSeen = new WeakMap<object, unknown>();
  rawSeen.set(source, rawState);
  mutableSeen.set(source, mutableState);
  publicSeen.set(source, publicState);
  nextKeys.forEach((key) => {
    ensureMutableAdapterRawDescriptor(rawState, mutableState, publicState, key);
    rawState[key] = sanitizeReplacementState(source[key], rawSeen);
    mutableState[key] = sanitizeReplacementState(source[key], mutableSeen);
    publicState[key] = sanitizeReplacementState(source[key], publicSeen);
  });
};

export const applyMutableAdapterPatches = (
  baseState: unknown,
  patches: Patches,
  rawState: Record<PropertyKey, unknown>,
  mutableState: Record<PropertyKey, unknown>,
  publicState: Record<PropertyKey, unknown>,
  validateState?: (state: unknown) => void
) => {
  assertSafePatches(patches, 'mutable adapter apply()');
  const patchBase = baseState === publicState ? rawState : baseState;
  const nextState = applyWithMutative(
    toMutableAdapterSnapshot(patchBase) as Record<PropertyKey, unknown>,
    patches
  ) as Record<PropertyKey, unknown>;
  validateState?.(nextState);
  replaceMutableAdapterState(rawState, mutableState, publicState, nextState);
};

export const toMutableAdapterSnapshot = (
  value: unknown,
  visited = new WeakMap<object, unknown>()
): unknown => {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return visited.get(value);
    }
    const next: unknown[] = [];
    next.length = value.length;
    visited.set(value, next);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = toMutableAdapterSnapshot(value[index], visited);
      }
    }
    const source = value as unknown as Record<PropertyKey, unknown>;
    const target = next as unknown as Record<PropertyKey, unknown>;
    for (const key of getMutableAdapterOwnEnumerableKeys(value)) {
      if (isArrayIndexKey(key) || isMutableAdapterUnsafeKey(key)) {
        continue;
      }
      const child = source[key];
      if (typeof child !== 'function') {
        target[key] = toMutableAdapterSnapshot(child, visited);
      }
    }
    return next;
  }
  if (typeof value === 'object' && value !== null) {
    if (!isObjectRecord(value)) {
      return value;
    }
    if (visited.has(value)) {
      return visited.get(value);
    }
    const next: Record<PropertyKey, unknown> = {};
    visited.set(value, next);
    for (const key of getMutableAdapterOwnEnumerableKeys(value)) {
      if (isMutableAdapterUnsafeKey(key)) {
        continue;
      }
      const child = (value as Record<PropertyKey, unknown>)[key];
      if (typeof child !== 'function') {
        next[key] = toMutableAdapterSnapshot(child, visited);
      }
    }
    return next;
  }
  return value;
};

export const snapshotMutableAdapterPureState = (store: Store<object>) =>
  toMutableAdapterSnapshot(store.getPureState()) as Record<
    PropertyKey,
    unknown
  >;

export const isEqualMutableAdapterSnapshot = (
  left: unknown,
  right: unknown,
  visited = new WeakMap<object, WeakSet<object>>()
): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray || left.length !== right.length) {
      return false;
    }
  } else if (!isObjectRecord(left) || !isObjectRecord(right)) {
    return false;
  }
  let seenTargets = visited.get(left);
  if (!seenTargets) {
    seenTargets = new WeakSet<object>();
    visited.set(left, seenTargets);
  } else if (seenTargets.has(right)) {
    return true;
  }
  seenTargets.add(right);
  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = getMutableAdapterOwnEnumerableKeys(left);
  const rightKeys = getMutableAdapterOwnEnumerableKeys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
      return false;
    }
    if (
      !isEqualMutableAdapterSnapshot(leftRecord[key], rightRecord[key], visited)
    ) {
      return false;
    }
  }
  return true;
};
