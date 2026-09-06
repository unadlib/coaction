import {
  applyMutableAdapterPatches,
  createBinder,
  isEqualMutableAdapterSnapshot as isEqualSnapshot,
  onStoreReady,
  replaceExternalStoreState,
  replaceMutableAdapterState as replaceMutableState,
  sanitizeInitialStateValue,
  snapshotMutableAdapterPureState as snapshotPureState,
  toMutableAdapterSnapshot as toTransportState,
  type Store
} from 'coaction/adapter';
import { createPinia } from 'pinia';
import type {
  _GettersTree,
  DefineStoreOptions,
  StateTree,
  StoreDefinition
} from 'pinia';

export * from 'pinia';

const instancesMap = new WeakMap<object, unknown>();

type SubscriptionCallback = (...args: unknown[]) => void;

type PiniaStoreInstance = {
  $id: string;
  $subscribe: (callback: SubscriptionCallback) => () => void;
};

type PiniaInternal = {
  /** How this adapter writes a change into its own runtime. See Internal. */
  externalApply?: (state?: any, patches?: any) => void;
  getTransportState?: () => unknown;
  rootState?: object;
  toMutableRaw?: (key: object) => PiniaStoreInstance | undefined;
  notifyStateChange?: () => void;
  assertAlive?: (operation: 'apply' | 'subscribe') => void;
  validateState?: (state: unknown) => void;
};

const reportAdapterStateError = (error: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
};

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<SubscriptionCallback>;
  _destroyers?: Set<() => void>;
};

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

type ReadonlyKeys<T> = {
  [K in keyof T]: Equal<
    { [P in K]: T[P] },
    Readonly<{ [P in K]: T[P] }>
  > extends true
    ? K
    : never;
}[keyof T];

export type IStore<T extends object> = [
  string,
  Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>,
  {
    [K in ReadonlyKeys<T>]: (
      state: Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>
    ) => T[K];
  },
  Pick<T, FunctionKeys<T>>
];

const handleStore = (
  store: StoreWithSubscriptions,
  state: object,
  _: object,
  internal: PiniaInternal
) => {
  const rawState = state as Record<PropertyKey, unknown>;
  internal.getTransportState = () => snapshotPureState(store);
  let isApplyingCoactionState = false;
  let lastSnapshot: Record<PropertyKey, unknown> | undefined;
  const restoreClientState = (snapshot: Record<PropertyKey, unknown>) => {
    const mutableStore = internal.toMutableRaw!(rawState);
    if (!mutableStore) {
      return;
    }
    const rollbackSnapshot = toTransportState(snapshot) as Record<
      PropertyKey,
      unknown
    >;
    isApplyingCoactionState = true;
    try {
      const currentRawState = (internal.rootState ?? rawState) as Record<
        PropertyKey,
        unknown
      >;
      replaceMutableState(
        currentRawState,
        mutableStore as unknown as Record<PropertyKey, unknown>,
        store.getState() as Record<PropertyKey, unknown>,
        rollbackSnapshot
      );
    } finally {
      lastSnapshot = snapshotPureState(store);
      isApplyingCoactionState = false;
    }
  };
  const syncSharedExternalChange = () => {
    const currentSnapshot = snapshotPureState(store);
    if (isApplyingCoactionState) {
      lastSnapshot = currentSnapshot;
      return 'handled';
    }
    if (store.share === 'client' && lastSnapshot) {
      if (!isEqualSnapshot(currentSnapshot, lastSnapshot)) {
        restoreClientState(lastSnapshot);
      }
      return 'ignored';
    }
    if (store.share === 'main' && lastSnapshot) {
      const rootState = internal.rootState;
      internal.rootState = lastSnapshot;
      try {
        replaceExternalStoreState(
          store as any,
          internal as any,
          currentSnapshot,
          {
            syncImmutable: false
          }
        );
      } catch (error) {
        try {
          restoreClientState(lastSnapshot);
        } catch (rollbackError) {
          reportAdapterStateError(rollbackError);
        }
        reportAdapterStateError(error);
        return 'ignored';
      } finally {
        internal.rootState = rootState;
      }
      lastSnapshot = currentSnapshot;
      return 'handled';
    }
    lastSnapshot = currentSnapshot;
    return 'external';
  };
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) =>
      instancesMap.get(key) as PiniaStoreInstance | undefined;
    Object.assign(store, {
      subscribe: (callback: SubscriptionCallback) => {
        internal.assertAlive?.('subscribe');
        store._subscriptions!.add(callback);
        return () => {
          store._subscriptions?.delete(callback);
        };
      }
    });
    store._subscriptions = new Set<SubscriptionCallback>();
    store._destroyers = new Set<() => void>();
    const baseDestroy = store.destroy;
    let destroyed = false;
    store.destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      store._subscriptions?.clear();
      store._subscriptions = undefined;
      store._destroyers?.forEach((destroy) => destroy());
      store._destroyers?.clear();
      store._destroyers = undefined;
      baseDestroy();
    };
    // Only the write. `store.apply` stays Coaction's, so it keeps the commit
    // semantics and whatever middleware wrapped it before this ran.
    internal.externalApply = (nextState = store.getPureState(), patches) => {
      internal.assertAlive?.('apply');
      const previousSnapshot = lastSnapshot ?? snapshotPureState(store);
      isApplyingCoactionState = true;
      try {
        if (!patches) {
          if (nextState === store.getState()) return;
          internal.validateState?.(toTransportState(nextState));
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            internal.toMutableRaw!(rawState) as unknown as Record<
              PropertyKey,
              unknown
            >,
            store.getState() as Record<PropertyKey, unknown>,
            nextState as Record<PropertyKey, unknown>
          );
          return;
        }
        const currentRawState = (internal.rootState ?? rawState) as Record<
          PropertyKey,
          unknown
        >;
        applyMutableAdapterPatches(
          nextState,
          patches,
          currentRawState,
          internal.toMutableRaw!(rawState) as unknown as Record<
            PropertyKey,
            unknown
          >,
          store.getState() as Record<PropertyKey, unknown>,
          internal.validateState
        );
      } catch (error) {
        try {
          restoreClientState(previousSnapshot);
        } catch (rollbackError) {
          reportAdapterStateError(rollbackError);
        }
        throw error;
      } finally {
        lastSnapshot = snapshotPureState(store);
        isApplyingCoactionState = false;
        internal.notifyStateChange?.();
      }
    };
  }
  const mutableStore = internal.toMutableRaw(state);
  if (!mutableStore) {
    throw new Error('Pinia store instance is not found');
  }
  let stopWatch: (() => void) | undefined;
  const cancelReadySubscription = onStoreReady(store, () => {
    const currentRawState = (internal.rootState ?? rawState) as Record<
      PropertyKey,
      unknown
    >;
    replaceMutableState(
      currentRawState,
      mutableStore as unknown as Record<PropertyKey, unknown>,
      store.getState() as Record<PropertyKey, unknown>,
      sanitizeInitialStateValue(snapshotPureState(store))
    );
    lastSnapshot = snapshotPureState(store);
    stopWatch = mutableStore.$subscribe((...args: unknown[]) => {
      const change = syncSharedExternalChange();
      if (change === 'ignored') {
        return;
      }
      if (change === 'external') {
        internal.notifyStateChange?.();
      }
      store._subscriptions!.forEach((callback) => callback(...args));
    });
  });
  const destroy = () => {
    cancelReadySubscription();
    instancesMap.delete(state);
    stopWatch?.();
  };
  store._destroyers!.add(destroy);
};

/**
 * Bind a store to Pinia
 */
export const bindPinia = createBinder({
  handleStore,
  handleState: ((options: DefineStoreOptions<any, any, any, any>) => {
    const descriptors: Record<string, PropertyDescriptor> = {};
    options.getters = options.getters ?? {};
    options.actions = options.actions ?? {};
    for (const key of Object.keys(options.getters)) {
      const getter = options.getters[key];
      if (typeof getter !== 'function') {
        continue;
      }
      descriptors[key] = {
        get() {
          return getter.call(this, this);
        }
      };
    }
    const rawState = Object.defineProperties(
      {
        ...options.state?.(),
        ...options.actions
      },
      descriptors
    );
    return {
      copyState: options as any,
      key: 'actions',
      bind: (state: any) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }) as any
}) as <
  Id extends string,
  S extends StateTree = {},
  G extends _GettersTree<S> = {},
  A = {}
>(
  options: Omit<DefineStoreOptions<Id, S, G, A>, 'id'>
) => Omit<DefineStoreOptions<Id, S, G, A>, 'id'>;

/**
 * Adapt a store type to Pinia
 */
export const adapt = <T extends object>(
  store: StoreDefinition<IStore<T>[0], IStore<T>[1], IStore<T>[2], IStore<T>[3]>
) => {
  if (typeof store !== 'function') {
    return store as any as T;
  }
  const pinia = createPinia();
  const boundStore = ((...args: Parameters<typeof store>) => {
    const [piniaOverride, hot] = args;
    return store(piniaOverride ?? pinia, hot);
  }) as typeof store;
  Object.assign(boundStore, store);
  return boundStore as any as T;
};

export type PiniaStore<T extends object> = StoreDefinition<
  IStore<T>[0],
  IStore<T>[1],
  IStore<T>[2],
  IStore<T>[3]
>;
