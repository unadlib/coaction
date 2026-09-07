import { apply, type Patches } from 'mutative';

export const isImmutableStateObject = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const getImmutableStateSnapshot = (
  value: unknown,
  cache: WeakMap<object, unknown>
): unknown => {
  if (!isImmutableStateObject(value)) {
    return value;
  }
  const cached = cache.get(value);
  if (cached) {
    return cached;
  }
  const isArray = Array.isArray(value);
  const snapshot: Record<PropertyKey, unknown> | unknown[] = isArray
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value));
  cache.set(value, snapshot);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === 'length') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      descriptor.value = getImmutableStateSnapshot(descriptor.value, cache);
    }
    Object.defineProperty(snapshot, key, descriptor);
  }
  return Object.freeze(snapshot);
};

/** Carry forward scalar edits; build replacements from the committed identities.
 * Mutative.apply clones object payloads, losing both their frozen descendants
 * and the snapshot cache's source mapping. Reuse the cache directly instead.
 */
export const updateImmutableStateSnapshot = (
  state: unknown,
  previousSnapshot: unknown,
  patches: Patches,
  cache: WeakMap<object, unknown>,
  sources?: WeakMap<object, object>
) => {
  const snapshot = patches.some(
    (patch) => typeof patch.value === 'object' && patch.value !== null
  )
    ? getImmutableStateSnapshot(state, cache)
    : apply(previousSnapshot as object, patches);
  finalizeImmutableStateSnapshot(state, snapshot, patches, cache, sources);
};

export const finalizeImmutableStateSnapshot = (
  state: unknown,
  snapshot: unknown,
  patches: Patches,
  cache: WeakMap<object, unknown>,
  sources?: WeakMap<object, object>
) => {
  const mapPair = (value: unknown, snapshotValue: unknown) => {
    if (
      isImmutableStateObject(value) &&
      isImmutableStateObject(snapshotValue)
    ) {
      cache.set(value, snapshotValue);
      sources?.set(snapshotValue, value);
    }
  };
  mapPair(state, snapshot);
  for (const patch of patches) {
    let value = state;
    let snapshotValue = snapshot;
    const ancestors: object[] = [];
    if (isImmutableStateObject(snapshotValue)) {
      ancestors.push(snapshotValue);
    }
    for (const key of patch.path) {
      if (
        !isImmutableStateObject(value) ||
        !isImmutableStateObject(snapshotValue)
      ) {
        break;
      }
      value = (value as Record<PropertyKey, unknown>)[key];
      snapshotValue = (snapshotValue as Record<PropertyKey, unknown>)[key];
      mapPair(value, snapshotValue);
      if (isImmutableStateObject(snapshotValue)) {
        ancestors.push(snapshotValue);
      }
    }
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      if (!Object.isFrozen(ancestors[index])) {
        Object.freeze(ancestors[index]);
      }
    }
  }
};

export const indexImmutableStateSnapshot = (
  state: unknown,
  snapshot: unknown,
  sources: WeakMap<object, object>,
  seen = new WeakSet<object>()
) => {
  if (
    !isImmutableStateObject(state) ||
    !isImmutableStateObject(snapshot) ||
    seen.has(snapshot)
  ) {
    return;
  }
  seen.add(snapshot);
  sources.set(snapshot, state);
  for (const key of Reflect.ownKeys(state)) {
    const stateDescriptor = Object.getOwnPropertyDescriptor(state, key);
    const snapshotDescriptor = Object.getOwnPropertyDescriptor(snapshot, key);
    if (
      stateDescriptor &&
      snapshotDescriptor &&
      Object.prototype.hasOwnProperty.call(stateDescriptor, 'value') &&
      Object.prototype.hasOwnProperty.call(snapshotDescriptor, 'value')
    ) {
      indexImmutableStateSnapshot(
        stateDescriptor.value,
        snapshotDescriptor.value,
        sources,
        seen
      );
    }
  }
};
