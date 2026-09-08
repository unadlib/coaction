import { computed, getActiveSub, setActiveSub } from 'alien-signals';
import type { ReactiveNode } from 'alien-signals/system';
import type { Internal } from './internal';
import {
  beginReactiveSubscriberTrack,
  disposeReactiveSubscriber,
  endReactiveSubscriberTrack,
  normalizeReactivePath,
  registerReactiveSubscriber,
  retainReactiveTraversalPaths,
  trackReactivePath
} from './reactivePath';
import { purgeDeps } from './reactiveTracker';
import { sharedRegistry } from './sharedRegistry';
import {
  getReadonlyStateValueVersion,
  trackReadonlyStateValue
} from './getRawStateStateProperty';

/** A lazy store-owned derived read. Dispose it when its owner no longer needs it. */
export type Derived<T> = {
  (): T;
  /** Release dependencies and cached values. Further reads throw. Idempotent. */
  dispose(): void;
};

/** The value selected by a tuple of state keys, including optional parents. */
export type PathValue<
  T,
  P extends readonly PropertyKey[]
> = P extends readonly []
  ? T
  : P extends readonly [infer K, ...infer Rest extends PropertyKey[]]
    ? T extends null | undefined
      ? undefined
      : K extends keyof T
        ? PathValue<T[K], Rest>
        : undefined
    : unknown;

type StoreReader<T> = { getState(): T };

/** Optional result equality, separate from dependency tracking. */
export type DerivedOptions<T> = {
  /**
   * Defaults to Object.is. Returning true reuses the previous result. The
   * comparator must be pure and runs without recording reactive dependencies.
   * Changes inside a returned live state facade still propagate.
   */
  equals?: (previous: T, next: T) => boolean;
};

/** Controls automatic dependency selection and result equality. */
export type DeriveOptions<T> = DerivedOptions<T> & {
  /**
   * Opt into leaf/structure tracking. Default false preserves all traversed
   * object identities. With deep enabled, mark identity observations with
   * identity(value); JavaScript equality and WeakMap lookups have no proxy trap.
   */
  deep?: boolean;
};

type StateRefs = Map<object, number> | undefined;
type Result<T> = { value: T; refs: StateRefs } | { error: unknown };

// State objects returned inside plain data wrappers are terminal dependencies,
// even when the same evaluation also read a child. Do not invoke output getters
// or walk opaque instances/closures. Their identity reads need explicit markers.
const trackResult = (value: unknown): StateRefs => {
  if (!value || typeof value !== 'object') return;
  const seen = new WeakSet<object>();
  const pending = [value];
  let refs: StateRefs;
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (trackReadonlyStateValue(current)) {
      (refs ??= new Map()).set(current, getReadonlyStateValueVersion(current)!);
      continue;
    }
    const proto = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && proto !== Object.prototype && proto !== null)
      continue;
    for (const key of Reflect.ownKeys(current)) {
      const child = Object.getOwnPropertyDescriptor(current, key)?.value;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return refs;
};

const sameRefs = (left: StateRefs, right: StateRefs) =>
  left?.size === right?.size &&
  (!left ||
    [...left].every(([value, version]) => right?.get(value) === version));

const getInternal = <T extends object>(store: StoreReader<T>) => {
  const state = store.getState();
  const meta = sharedRegistry.publicStatePathMeta.get(state) as
    | { internal: Internal<T> }
    | undefined;
  if (
    !meta ||
    meta.internal.mutableInstance ||
    meta.internal.updateImmutable ||
    meta.internal.externalApply
  ) {
    throw new Error(
      'Derived values require a native immutable Coaction store.'
    );
  }
  meta.internal.assertAlive?.('subscribe');
  return meta.internal;
};

const createDerived = <T extends object, R>(
  internal: Internal<T>,
  evaluate: () => R,
  retainObjects = false,
  equals: (previous: R, next: R) => boolean = Object.is
): Derived<R> => {
  let context:
    | { internal: Internal<T>; evaluate: () => R; equals: typeof equals }
    | undefined = { internal, evaluate, equals };
  let evaluating = false;
  let node: ReactiveNode | undefined;
  let cached: Result<R> | undefined;
  const evaluateRead = () => {
    const { internal, evaluate } = context!;
    evaluating = true;
    // A deep read can be nested inside a native frozen-snapshot getter.
    const previousDepth = internal.computedReadDepth;
    internal.computedReadDepth = 0;
    try {
      return evaluate();
    } finally {
      internal.computedReadDepth = previousDepth;
      evaluating = false;
    }
  };
  let read = computed<Result<R>>((previous) => {
    if (!context) return { error: new Error('Derived value is disposed.') };
    const { equals } = context;
    if (!node) {
      node = getActiveSub()!;
      registerReactiveSubscriber(node);
    }
    beginReactiveSubscriberTrack(node);
    try {
      const value = evaluateRead();
      const refs = trackResult(value);
      if (previous && 'value' in previous) {
        const subscriber = setActiveSub(undefined);
        try {
          if (equals(previous.value, value) && sameRefs(previous.refs, refs)) {
            // Record this evaluation's dependencies even when its output is
            // equivalent. A changed branch can otherwise leave the cache stale.
            return (cached = previous);
          }
        } finally {
          setActiveSub(subscriber);
        }
      }
      return (cached = { value, refs });
    } catch (error) {
      // Cache failures as data so alien-signals still installs the caller's
      // link. Every read throws until an input changes, then evaluation retries.
      return (cached = { error });
    } finally {
      if (retainObjects) retainReactiveTraversalPaths(node);
      endReactiveSubscriberTrack(node);
    }
  });
  const dispose = () => {
    if (!context) return;
    const { internal } = context;
    // The public handle may survive its owner. Drop the owner and callback
    // closures as well as the dependency links, including never-read handles.
    context = undefined;
    internal.destroyCallbacks?.delete(dispose);
    if (node) {
      node.depsTail = undefined;
      purgeDeps(node);
      disposeReactiveSubscriber(node);
      node = undefined;
    }
    // The alien node can still be retained by a consumer. Clear our own result
    // envelope instead of depending on undocumented fields of that node.
    if (cached) {
      if ('value' in cached) {
        cached.value = undefined!;
        cached.refs = undefined;
      } else cached.error = undefined;
      cached = undefined;
    }
    // Drop the cached result even if the disposed public function stays alive.
    read = undefined!;
  };
  internal.destroyCallbacks!.add(dispose);
  return Object.assign(
    () => {
      if (!context) throw new Error('Derived value is disposed.');
      const { internal } = context;
      if (evaluating) throw new Error('Circular derived evaluation.');
      if (internal.isBatching) {
        const previous = setActiveSub(undefined);
        try {
          // Drafts never enter the committed cache or dependency graph.
          return evaluateRead();
        } finally {
          setActiveSub(previous);
        }
      }
      const result = read();
      if ('error' in result) throw result.error;
      return result.value;
    },
    { dispose }
  );
};

/**
 * Mark a state object identity without unwrapping its readonly view.
 *
 * @remarks
 * Import from `coaction/derived`. Use inside deep selectors before comparing
 * objects, using them as WeakMap keys, or capturing them in opaque output values.
 * Unlike whole(), this preserves the public readonly object's identity.
 */
export const identity = <T>(value: T): T => {
  trackReadonlyStateValue(value);
  return value;
};

/**
 * Create a lazy, disposable selector owned by one immutable Coaction store.
 *
 * @remarks
 * Import from `coaction/derived`. Default tracking includes object identities.
 * Use `{ deep: true }` for leaf/structure value selection; identity observations
 * then need identity(value). Returned state inside plain data wrappers is
 * tracked automatically. Results use Object.is equality, including NaN and -0.
 * Draft reads bypass the committed cache. Dispose when the owner no longer
 * needs this read; store.destroy() also disposes it. Selectors are synchronous
 * pure reads. Native getters remain the fast frozen-snapshot option for scans.
 */
export const derive = <T extends object, R>(
  store: StoreReader<T>,
  selector: (state: T) => R,
  options: DeriveOptions<R> = {}
): Derived<R> => {
  const internal = getInternal(store);
  return createDerived(
    internal,
    () => selector(internal.module),
    !options.deep,
    options.equals
  );
};

/**
 * Cache a state-data path without collecting intermediate object reads.
 *
 * @remarks
 * Import from `coaction/derived`. Missing paths return undefined. The path is
 * copied at creation; use `derive` for dynamic selection or native getters.
 * Values stay readonly outside recipes. Reads inside recipes see the draft
 * without changing the committed cache. Dispose the read when no longer needed;
 * store.destroy() also disposes it. This API supports native immutable stores.
 */
export const derivePath = <
  T extends object,
  const P extends readonly PropertyKey[]
>(
  store: StoreReader<T>,
  path: P,
  options: DerivedOptions<PathValue<T, P>> = {}
): Derived<PathValue<T, P>> => {
  const internal = getInternal(store);
  const keys = normalizeReactivePath(path);
  return createDerived(
    internal,
    () => {
      trackReactivePath(internal, keys);
      // Resolve scalar paths on owned state, with no proxy traps or per-level
      // signal links. Object results use the canonical public readonly view.
      let value: any = internal.rootState;
      for (const key of keys) {
        if (
          value == null ||
          !Object.prototype.hasOwnProperty.call(value, key)
        ) {
          if (value === internal.rootState && key in internal.module) {
            throw new Error(
              'derivePath selects state data; use derive for getters.'
            );
          }
          return undefined as PathValue<T, P>;
        }
        value = value[key];
      }
      if (!value || typeof value !== 'object') return value as PathValue<T, P>;
      const previous = setActiveSub(undefined);
      try {
        let publicValue: any = internal.module;
        for (const key of keys) publicValue = publicValue[key];
        return publicValue as PathValue<T, P>;
      } finally {
        setActiveSub(previous);
      }
    },
    false,
    options.equals
  );
};
