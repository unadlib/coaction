import { Computed, createCachedGetter } from './computed';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import {
  getImmutableStateSnapshot,
  indexImmutableStateSnapshot,
  isImmutableStateObject
} from './immutableState';
import { sharedRegistry } from './sharedRegistry';
import { sanitizeInitialStateValue } from './utils';
import {
  getReactivePathVersion,
  isReactiveTrackingActive,
  trackReactivePath,
  trackReactiveStructure,
  trackReactiveTraversalPath,
  type ReactivePath
} from './reactivePath';

// A readonly value keeps one proxy per source object so aliased and circular
// references stay identical through the public state, which means a single
// proxy can be reachable at more than one path. Every path it is reached at is
// recorded, and reads track all of them: the proxy cannot tell which path the
// caller traversed, so tracking the union is the only choice that never misses
// an update. Aliasing is rare, so the extra notifications it can cause are too.
type ReactivePathMeta = {
  internal: Internal<any>;
  paths: ReactivePath[];
};

// Shared across entry points: a value created by `coaction` is read
// through `coaction/adapter`, and a per-bundle map would not recognise it.
const publicStatePathMeta = sharedRegistry.publicStatePathMeta as WeakMap<
  object,
  ReactivePathMeta
>;
/** Reverse of the readonly proxy cache, so a proxy can hand back its source. */
const readonlyProxySource = sharedRegistry.readonlyProxySource;

const areReactivePathsEqual = (left: ReactivePath, right: ReactivePath) =>
  left.length === right.length &&
  left.every((segment, index) => Object.is(segment, right[index]));

const addReactivePathTo = (
  meta: ReactivePathMeta,
  path: ReactivePath,
  owned: boolean
) => {
  if (meta.paths.some((known) => areReactivePathsEqual(known, path))) {
    return;
  }
  // `owned` marks a path the caller built for this call and will not reuse,
  // so it can be stored as-is instead of copied again on every property read.
  meta.paths.push(owned ? path : [...path]);
};

const mergeReadonlyStateValuePaths = <T extends CreateState>(
  value: object,
  internal: Internal<T>,
  paths: readonly ReactivePath[] | undefined,
  owned = false
) => {
  if (!paths?.length) {
    return;
  }
  let meta = publicStatePathMeta.get(value);
  if (!meta) {
    meta = { internal, paths: [] };
    publicStatePathMeta.set(value, meta);
  } else if (meta.internal !== internal) {
    return;
  }
  for (const path of paths) {
    addReactivePathTo(meta, path, owned);
  }
};

/** @internal Register frozen public store/slice facades as terminal paths. */
export const registerReadonlyStateValuePath = <T extends CreateState>(
  value: object,
  internal: Internal<T>,
  path: ReactivePath
) => {
  mergeReadonlyStateValuePaths(value, internal, [path]);
};

/**
 * Mark an object-valued selector result as a terminal reactive dependency.
 * Framework adapters call this while their tracker is active so returning a
 * readonly state object is reactive even when the selector does not read a
 * primitive child.
 */
export const trackReadonlyStateValue = (value: unknown) => {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value) {
    return false;
  }
  const meta = publicStatePathMeta.get(value as object);
  if (!meta) {
    return false;
  }
  for (const path of meta.paths) {
    trackReactivePath(meta.internal, path);
  }
  return true;
};

/**
 * Semantic version for a public readonly state facade/proxy. Summing the
 * per-path versions keeps the result strictly increasing when any path the
 * value is reachable at changes, which is all callers compare it for.
 *
 * Part of the published `coaction/adapter` surface, so it must not be tagged
 * as internal: `stripInternal` would drop the declaration from the emitted
 * types and leave the adapter entry re-exporting a name that is not there.
 */
export const getReadonlyStateValueVersion = (value: unknown) => {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value) {
    return undefined;
  }
  const meta = publicStatePathMeta.get(value as object);
  if (!meta) {
    return undefined;
  }
  let version = 0;
  for (const path of meta.paths) {
    version += getReactivePathVersion(meta.internal, path);
  }
  return version;
};

/**
 * Depend on a value as a whole, and read it as a plain object.
 *
 * Reading a collection through the public state records one dependency per
 * element touched, which is what makes an unrelated sibling write cheap. When a
 * selector scans the whole collection that precision buys nothing -- any change
 * to it invalidates the scan anyway -- and every element read pays for a proxy
 * trap. `whole()` records a single dependency on the value and returns the
 * underlying object, so the scan runs at plain-object speed:
 *
 * ```ts
 * const total = useStore((state) => sum(whole(state.items)));
 * ```
 *
 * The selector re-runs when anything inside `items` changes, and not otherwise.
 *
 * The returned object is the store's own data, exactly as `getPureState()`
 * returns it. Read it; never mutate it -- writes belong in `set()`, and a
 * mutation here corrupts the store without going through a transaction.
 *
 * Values that did not come from a Coaction store are returned unchanged, which
 * includes values from a store built by a *different* entry point: `coaction`
 * and `coaction` are separate bundles that do not share this registry, so
 * import `whole` from the same entry you created the store with. Getting that
 * wrong stays correct -- reads fall back to per-element tracking -- but gives up
 * the speed this exists for.
 */
export const whole = <T>(value: T): T => {
  if ((typeof value !== 'object' && typeof value !== 'function') || !value) {
    return value;
  }
  const meta = publicStatePathMeta.get(value as object);
  if (!meta) {
    return value;
  }
  for (const path of meta.paths) {
    trackReactivePath(meta.internal, path);
  }
  return (readonlyProxySource.get(value as object) ?? value) as T;
};

type PrepareStateDescriptorOptions<T extends CreateState> = {
  descriptor: PropertyDescriptor;
  internal: Internal<T>;
  initialStateSeen: WeakMap<object, unknown>;
  key: PropertyKey;
  rawState: Record<PropertyKey, any>;
  sliceKey?: PropertyKey;
};

const assertImmutableStateMutationAllowed = <T extends CreateState>(
  internal: Internal<T>
) => {
  if (internal.mutableInstance || internal.isBatching) {
    return;
  }
  throw new Error(
    'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).'
  );
};

// Key the cache by the immutable source object so obsolete snapshots and their
// dynamic dictionary paths can be reclaimed together, and so one source object
// keeps one proxy no matter how many paths reach it.
const readonlyProxyCache = sharedRegistry.readonlyProxyCache as WeakMap<
  Internal<any>,
  WeakMap<object, object>
>;

const getReadonlyProxyCache = <T extends CreateState>(
  internal: Internal<T>
) => {
  let byValue = readonlyProxyCache.get(internal);
  if (!byValue) {
    byValue = new WeakMap<object, object>();
    readonlyProxyCache.set(internal, byValue);
  }
  return byValue;
};

const getPublicStateObject = <T extends CreateState>(
  internal: Internal<T>,
  value: object,
  sliceKey?: PropertyKey
) => {
  if (value === internal.rootState) {
    return internal.module;
  }
  if (
    typeof sliceKey === 'undefined' ||
    typeof internal.rootState !== 'object' ||
    internal.rootState === null ||
    typeof internal.module !== 'object' ||
    internal.module === null
  ) {
    return undefined;
  }
  const rootState = internal.rootState as Record<PropertyKey, unknown>;
  const module = internal.module as Record<PropertyKey, unknown>;
  if (rootState[sliceKey] === value) {
    return module[sliceKey];
  }
  return undefined;
};

const toReadonlyStateValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey,
  paths?: readonly ReactivePath[]
): unknown => {
  if (
    internal.mutableInstance ||
    internal.isBatching ||
    !isImmutableStateObject(value)
  ) {
    return value;
  }
  if (internal.computedReadDepth) {
    for (const path of paths ?? []) {
      if (path.length) {
        trackReactivePath(internal, path);
      }
    }
    const cache = (internal.computedSnapshotCache ??= new WeakMap());
    if (
      isImmutableStateObject(internal.rootState) &&
      !cache.has(internal.rootState)
    ) {
      getImmutableStateSnapshot(internal.rootState, cache);
    }
    return getImmutableStateSnapshot(value, cache);
  }
  const publicValue = getPublicStateObject(internal, value, sliceKey);
  if (publicValue) {
    return publicValue;
  }
  const cache = getReadonlyProxyCache(internal);
  const cached = cache.get(value as object);
  if (cached) {
    mergeReadonlyStateValuePaths(cached, internal, paths, true);
    return cached;
  }
  // The proxy holds its own meta rather than looking it up per property read.
  // The array is read at trap time, not captured, because a proxy can still
  // pick up further paths later when an alias of the same object is traversed.
  const meta: ReactivePathMeta = { internal, paths: [] };
  const trackedPaths = () => meta.paths;
  const proxy: object = new Proxy(value as Record<PropertyKey, unknown>, {
    get(target, key, receiver) {
      const nextValue = Reflect.get(target, key, receiver);
      // Nothing can be recorded without an active subscriber, so skip the
      // whole path-building step instead of building child paths that every
      // `track*` call would immediately discard.
      if (!isReactiveTrackingActive()) {
        return toReadonlyStateValue(internal, nextValue, sliceKey);
      }
      const isStateObject = isImmutableStateObject(nextValue);
      const isOwn = Object.prototype.hasOwnProperty.call(target, key);
      // `Reflect.has` walks the prototype chain; an own key can never be
      // missing, so only ask when the key is not the target's own.
      const isTracked =
        isOwn ||
        !Reflect.has(target, key) ||
        (Array.isArray(target) && key === 'length');
      // Indexed loop, not for-of: this runs on every tracked property read and
      // the path list is almost always a single entry.
      const basePaths = trackedPaths();
      const nextPaths: ReactivePath[] = new Array(basePaths.length);
      for (let index = 0; index < basePaths.length; index += 1) {
        const nextPath = [...basePaths[index], key];
        if (isStateObject) {
          trackReactiveTraversalPath(internal, nextPath);
        } else if (isTracked) {
          trackReactivePath(internal, nextPath);
        }
        nextPaths[index] = nextPath;
      }
      return toReadonlyStateValue(internal, nextValue, sliceKey, nextPaths);
    },
    has(target, key) {
      if (isReactiveTrackingActive()) {
        for (const path of trackedPaths()) {
          trackReactiveStructure(internal, path);
        }
      }
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      if (isReactiveTrackingActive()) {
        for (const path of trackedPaths()) {
          trackReactiveStructure(internal, path);
        }
      }
      return Reflect.ownKeys(target);
    },
    set() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    deleteProperty() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    defineProperty() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    },
    setPrototypeOf() {
      assertImmutableStateMutationAllowed(internal);
      return false;
    }
  });
  cache.set(value as object, proxy);
  readonlyProxySource.set(proxy, value as object);
  publicStatePathMeta.set(proxy, meta);
  if (paths) {
    for (const path of paths) {
      addReactivePathTo(meta, path, true);
    }
  }
  return proxy;
};

const toPublicComputedValue = <T extends CreateState>(
  internal: Internal<T>,
  value: unknown,
  sliceKey?: PropertyKey
) => {
  if (!isImmutableStateObject(value)) {
    return value;
  }
  const cache = internal.computedSnapshotCache;
  const rootSnapshot = cache?.get(internal.rootState as unknown as object);
  const sources = (internal.computedSnapshotSources ??= new WeakMap());
  let source = sources.get(value);
  if (!source && Object.isFrozen(value) && rootSnapshot) {
    indexImmutableStateSnapshot(internal.rootState, rootSnapshot, sources);
    source = sources.get(value);
  }
  if (source) {
    internal.computedIdentityRequired = true;
  }
  return source ? toReadonlyStateValue(internal, source, sliceKey) : value;
};

export const prepareStateDescriptor = <T extends CreateState>({
  descriptor,
  initialStateSeen,
  internal,
  key,
  rawState,
  sliceKey
}: PrepareStateDescriptorOptions<T>) => {
  const isComputed = descriptor.value instanceof Computed;
  const readStateValue = () =>
    typeof sliceKey !== 'undefined'
      ? (internal.rootState as any)[sliceKey][key]
      : (internal.rootState as any)[key];
  const initialValue = isComputed
    ? descriptor.value
    : sanitizeInitialStateValue(descriptor.value, initialStateSeen);
  if (internal.mutableInstance) {
    Object.defineProperty(rawState, key, {
      get: () => internal.mutableInstance[key],
      set: (value) => {
        internal.mutableInstance[key] = value;
      },
      configurable: true,
      enumerable: descriptor.enumerable
    });
  } else if (!isComputed) {
    Object.defineProperty(rawState, key, {
      value: initialValue,
      configurable: true,
      enumerable: descriptor.enumerable,
      writable: true
    });
  }

  if (isComputed) {
    if (internal.mutableInstance) {
      throw new Error('Computed is not supported with mutable instance');
    }
    const getComputed = (descriptor.value as Computed).createGetter({
      internal
    });
    descriptor.get = function () {
      return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
    };
  } else if (typeof sliceKey !== 'undefined') {
    descriptor.get = () => {
      const value = readStateValue();
      const path: ReactivePath = [sliceKey, key];
      if (isImmutableStateObject(value)) {
        trackReactiveTraversalPath(internal, path);
      } else {
        trackReactivePath(internal, path);
      }
      return toReadonlyStateValue(internal, value, sliceKey, [path]);
    };
    descriptor.set = (value: unknown) => {
      assertImmutableStateMutationAllowed(internal);
      (internal.rootState as any)[sliceKey][key] = value;
    };
  } else {
    descriptor.get = () => {
      const value = readStateValue();
      const path: ReactivePath = [key];
      if (isImmutableStateObject(value)) {
        trackReactiveTraversalPath(internal, path);
      } else {
        trackReactivePath(internal, path);
      }
      return toReadonlyStateValue(internal, value, undefined, [path]);
    };
    descriptor.set = (value: unknown) => {
      assertImmutableStateMutationAllowed(internal);
      (internal.rootState as any)[key] = value;
    };
  }

  // handle state property
  delete descriptor.value;
  delete descriptor.writable;
};

export const prepareAccessorDescriptor = <T extends CreateState>({
  descriptor,
  internal,
  sliceKey
}: Pick<
  PrepareStateDescriptorOptions<T>,
  'descriptor' | 'internal' | 'sliceKey'
>) => {
  if (internal.mutableInstance || typeof descriptor.get !== 'function') {
    return;
  }
  const getComputed = createCachedGetter(internal, descriptor.get);
  descriptor.get = function () {
    return toPublicComputedValue(internal, getComputed.call(this), sliceKey);
  };
};
