import { computed, getActiveSub, setActiveSub } from 'alien-signals';
import type { ReactiveNode } from 'alien-signals/system';
import type { Internal } from './internal';
import {
  beginReactiveSubscriberTrack,
  disposeReactiveSubscriber,
  endReactiveSubscriberTrack,
  normalizeReactivePath,
  registerReactiveSubscriber,
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
type Result<T> = { value: T; version?: number } | { error: unknown };

const getInternal = <T extends object>(store: StoreReader<T>) => {
  const state = store.getState();
  const meta = sharedRegistry.publicStatePathMeta.get(state) as
    | { internal: Internal<T> }
    | undefined;
  if (!meta || meta.internal.mutableInstance) {
    throw new Error(
      'Derived values require a native immutable Coaction store.'
    );
  }
  meta.internal.assertAlive?.('subscribe');
  return meta.internal;
};

const createDerived = <T extends object, R>(
  internal: Internal<T>,
  evaluate: () => R
): Derived<R> => {
  let disposed = false;
  let evaluating = false;
  let node: ReactiveNode | undefined;
  const evaluateRead = () => {
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
    if (disposed) return { error: new Error('Derived value is disposed.') };
    if (!node) {
      node = getActiveSub()!;
      registerReactiveSubscriber(node);
    }
    beginReactiveSubscriberTrack(node);
    try {
      const value = evaluateRead();
      trackReadonlyStateValue(value);
      const version = getReadonlyStateValueVersion(value);
      return previous &&
        'value' in previous &&
        Object.is(previous.value, value) &&
        previous.version === version
        ? previous
        : { value, version };
    } catch (error) {
      // Cache failures as data so alien-signals still installs the caller's
      // link. Every read throws until an input changes, then evaluation retries.
      return { error };
    } finally {
      endReactiveSubscriberTrack(node);
    }
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    internal.destroyCallbacks?.delete(dispose);
    if (node) {
      node.depsTail = undefined;
      purgeDeps(node);
      disposeReactiveSubscriber(node);
      node = undefined;
    }
    // Drop the cached result even if the disposed public function stays alive.
    read = undefined!;
  };
  internal.destroyCallbacks!.add(dispose);
  return Object.assign(
    () => {
      if (disposed) throw new Error('Derived value is disposed.');
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
  path: P
): Derived<PathValue<T, P>> => {
  const internal = getInternal(store);
  const keys = normalizeReactivePath(path);
  return createDerived(internal, () => {
    trackReactivePath(internal, keys);
    // Resolve scalar paths on owned state, with no proxy traps or per-level
    // signal links. Object results use the canonical public readonly view.
    let value: any = internal.rootState;
    for (const key of keys) {
      if (value == null || !Object.prototype.hasOwnProperty.call(value, key)) {
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
  });
};
