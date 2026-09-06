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
import { proxy, subscribe } from 'valtio/vanilla';

export * from 'valtio/vanilla';

const instancesMap = new WeakMap<object, object>();

type ValtioInternal = {
  /** How this adapter writes a change into its own runtime. See Internal. */
  externalApply?: (state?: any, patches?: any) => void;
  getTransportState?: () => unknown;
  rootState?: object;
  toMutableRaw?: (key: object) => object | undefined;
  notifyStateChange?: () => void;
  assertAlive?: (operation: 'apply' | 'subscribe') => void;
  validateState?: (state: unknown) => void;
};

type StoreWithDestroyers = Store<object> & {
  _destroyers?: Set<() => void>;
  _listeners?: Set<() => void>;
};

const reportAdapterStateError = (error: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(error);
  }
};

const handleStore = (
  store: StoreWithDestroyers,
  rawState: object,
  state: object,
  internal: ValtioInternal
) => {
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) => instancesMap.get(key);
    internal.getTransportState = () =>
      toTransportState(internal.toMutableRaw?.(rawState) ?? rawState);
    const getMutableState = () => internal.toMutableRaw?.(rawState) ?? rawState;
    let isApplyingCoactionState = false;
    let lastSnapshot: Record<PropertyKey, unknown> | undefined;
    const restoreClientState = (snapshot: Record<PropertyKey, unknown>) => {
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
          getMutableState() as Record<PropertyKey, unknown>,
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
    store._destroyers = new Set();
    store._listeners = new Set();
    let unsubscribeExternal: (() => void) | undefined;
    const cancelReadySubscription = onStoreReady(store, () => {
      const currentRawState = (internal.rootState ?? rawState) as Record<
        PropertyKey,
        unknown
      >;
      replaceMutableState(
        currentRawState,
        getMutableState() as Record<PropertyKey, unknown>,
        store.getState() as Record<PropertyKey, unknown>,
        sanitizeInitialStateValue(snapshotPureState(store))
      );
      lastSnapshot = snapshotPureState(store);
      unsubscribeExternal = subscribe(getMutableState(), () => {
        const change = syncSharedExternalChange();
        if (change === 'ignored') {
          return;
        }
        if (change === 'external') {
          internal.notifyStateChange?.();
        }
        store._listeners?.forEach((listener) => listener());
      });
    });
    Object.assign(store, {
      subscribe: (listener: () => void) => {
        internal.assertAlive?.('subscribe');
        store._listeners!.add(listener);
        return () => {
          store._listeners?.delete(listener);
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
      store._listeners?.clear();
      store._listeners = undefined;
      store._destroyers?.forEach((destroy) => destroy());
      store._destroyers?.clear();
      store._destroyers = undefined;
      baseDestroy();
    };
    // Only the write. `store.apply` stays Coaction's, so it keeps the commit
    // semantics and whatever middleware wrapped it before this ran.
    internal.externalApply = (state = store.getPureState(), patches) => {
      internal.assertAlive?.('apply');
      const previousSnapshot = lastSnapshot ?? snapshotPureState(store);
      isApplyingCoactionState = true;
      try {
        if (!patches) {
          internal.validateState?.(toTransportState(state));
          const currentRawState = (internal.rootState ?? rawState) as Record<
            PropertyKey,
            unknown
          >;
          replaceMutableState(
            currentRawState,
            getMutableState() as Record<PropertyKey, unknown>,
            store.getState() as Record<PropertyKey, unknown>,
            state as Record<PropertyKey, unknown>
          );
          return;
        }
        const currentRawState = (internal.rootState ?? rawState) as Record<
          PropertyKey,
          unknown
        >;
        applyMutableAdapterPatches(
          state,
          patches,
          currentRawState,
          getMutableState() as Record<PropertyKey, unknown>,
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
};

interface BindValtio {
  <T extends object>(target: T): T;
}

/**
 * Bind a store to Valtio.
 */
export const bindValtio = createBinder<BindValtio>({
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

/**
 * Adapt a Valtio store type to state type.
 */
export const adapt = <T extends object>(store: T) => store as T;

export { proxy };
