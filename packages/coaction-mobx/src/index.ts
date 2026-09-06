import {
  applyMutableAdapterPatches,
  type Store,
  createBinder,
  getMutableAdapterOwnEnumerableKeys as getOwnEnumerableKeys,
  isEqualMutableAdapterSnapshot as isEqualSnapshot,
  isMutableAdapterUnsafeKey as isUnsafeKey,
  onStoreReady,
  replaceExternalStoreState,
  replaceMutableAdapterState as replaceMutableState,
  snapshotMutableAdapterPureState as snapshotPureState,
  toMutableAdapterSnapshot as toTransportState
} from 'coaction/adapter';
import { autorun, runInAction, untracked } from 'mobx';

const instancesMap = new WeakMap<object, object>();

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<() => void>;
};

type MobxInternal = {
  /** How this adapter writes a change into its own runtime. See Internal. */
  externalApply?: (state?: any, patches?: any) => void;
  getTransportState?: () => unknown;
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
  actMutable?: typeof runInAction;
  notifyStateChange?: () => void;
  assertAlive?: (operation: 'apply' | 'subscribe') => void;
  validateState?: (state: unknown) => void;
};

const reportAdapterStateError = (error: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
};

const deleteUnsafeEnumerableKeys = (
  value: unknown,
  seen = new WeakSet<object>()
) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const record = value as Record<PropertyKey, unknown>;
  for (const key of getOwnEnumerableKeys(value)) {
    if (isUnsafeKey(key)) {
      delete record[key];
      continue;
    }
    const child = record[key];
    if (typeof child !== 'function') {
      deleteUnsafeEnumerableKeys(child, seen);
    }
  }
};

const touchObservableTree = (value: unknown, seen = new WeakSet<object>()) => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    void value.length;
    value.forEach((item) => touchObservableTree(item, seen));
    return;
  }
  for (const key of Reflect.ownKeys(value as Record<PropertyKey, unknown>)) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      continue;
    }
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (typeof child !== 'function') {
      touchObservableTree(child, seen);
    }
  }
};

const handleStore = (
  store: StoreWithSubscriptions,
  rawState: object,
  state: object,
  internal: MobxInternal
) => {
  if (internal.toMutableRaw) return;
  internal.toMutableRaw = (key: object) => instancesMap.get(key);
  internal.getTransportState = () =>
    toTransportState(internal.toMutableRaw!(rawState) ?? rawState);
  store._subscriptions = new Set();
  let isApplyingCoactionState = false;
  let lastSnapshot: Record<PropertyKey, unknown> | undefined;
  let unsubscribeExternal: (() => void) | undefined;
  const restoreClientState = (snapshot: Record<PropertyKey, unknown>) => {
    const mutableState = internal.toMutableRaw!(rawState);
    if (!mutableState) {
      return;
    }
    const rollbackSnapshot = toTransportState(snapshot) as Record<
      PropertyKey,
      unknown
    >;
    isApplyingCoactionState = true;
    try {
      runInAction(() => {
        const currentRawState = (internal.rootState ?? rawState) as Record<
          PropertyKey,
          unknown
        >;
        replaceMutableState(
          currentRawState,
          mutableState as Record<PropertyKey, unknown>,
          store.getState() as Record<PropertyKey, unknown>,
          rollbackSnapshot
        );
      });
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
  const cancelReadySubscription = onStoreReady(store, () => {
    runInAction(() => {
      const mutableState = internal.toMutableRaw!(rawState);
      if (!mutableState) {
        return;
      }
      const currentRawState = (internal.rootState ?? rawState) as Record<
        PropertyKey,
        unknown
      >;
      const seen = new WeakSet<object>();
      deleteUnsafeEnumerableKeys(currentRawState, seen);
      deleteUnsafeEnumerableKeys(mutableState, seen);
      deleteUnsafeEnumerableKeys(store.getState(), seen);
    });
    lastSnapshot = snapshotPureState(store);
    let isInitialRun = true;
    unsubscribeExternal = autorun(() => {
      touchObservableTree(state);
      if (isInitialRun) {
        isInitialRun = false;
        return;
      }
      untracked(() => {
        const change = syncSharedExternalChange();
        if (change === 'ignored') {
          return;
        }
        if (change === 'external') {
          internal.notifyStateChange?.();
        }
        store._subscriptions?.forEach((listener) => listener());
      });
    });
  });
  Object.assign(store, {
    subscribe: (listener: () => void) => {
      internal.assertAlive?.('subscribe');
      store._subscriptions!.add(listener);
      return () => {
        store._subscriptions?.delete(listener);
      };
    }
  });
  const baseDestroy = store.destroy;
  let destroyed = false;
  store.destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    cancelReadySubscription();
    unsubscribeExternal?.();
    unsubscribeExternal = undefined;
    store._subscriptions?.clear();
    store._subscriptions = undefined;
    baseDestroy();
  };
  internal.actMutable = runInAction;
  // Only the write. `store.apply` stays Coaction's, so it keeps the commit
  // semantics and whatever middleware wrapped it before this ran.
  internal.externalApply = (state = store.getPureState(), patches) => {
    internal.assertAlive?.('apply');
    const previousSnapshot = lastSnapshot ?? snapshotPureState(store);
    isApplyingCoactionState = true;
    try {
      if (!patches) {
        internal.validateState?.(toTransportState(state));
        runInAction(() => {
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            internal.toMutableRaw!(rawState) as Record<PropertyKey, unknown>,
            store.getState() as Record<PropertyKey, unknown>,
            state as Record<PropertyKey, unknown>
          );
        });
        return;
      }
      runInAction(() => {
        const currentRawState = (internal.rootState ?? rawState) as Record<
          PropertyKey,
          unknown
        >;
        applyMutableAdapterPatches(
          state,
          patches!,
          currentRawState,
          internal.toMutableRaw!(rawState) as Record<PropertyKey, unknown>,
          store.getState() as Record<PropertyKey, unknown>,
          internal.validateState
        );
      });
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
};

interface BindMobx {
  <T>(target: T): T;
}

/**
 * Bind a store to Mobx
 */
export const bindMobx = createBinder<BindMobx>({
  handleStore,
  handleState: (options) => {
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const copyState = Object.defineProperties(
      {},
      descriptors
    ) as typeof options;
    const rawState = Object.defineProperties({}, descriptors) as typeof options;
    return {
      copyState,
      bind: (state) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }
});
