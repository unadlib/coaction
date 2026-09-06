import { apply as applyWithMutative, type Patches } from 'mutative';
import { applyMiddlewares } from './applyMiddlewares';
import { invalidateReactivePaths } from './reactivePath';
import {
  createImmutableSnapshotPatches,
  finalizeImmutableStateSnapshot
} from './immutableState';
import { defaultName } from './constant';
import { getInitialState } from './getInitialState';
import { getRawState, type LocalActionWrapper } from './getRawState';
import type { ClientActionFactory } from './getRawStateClientAction';
import { handleState } from './handleState';
import type {
  ClientStoreOptions,
  CreateState,
  Listener,
  MiddlewareStore,
  Slice,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import {
  disposeStoreCommitRuntime,
  getStoreCommitSource,
  hasStoreCommitListeners,
  hasStoreCommitPublishers,
  hasStoreCommitValidators,
  ownsStoreCommit,
  publishStoreCommit,
  registerStorePatchReplayer,
  validateStoreCommit
} from './storeCommit';
import {
  assertKnownStateShape,
  assertSafePatches,
  createInversePatches,
  createRootReplacementPatches,
  createStateSchema,
  getOwnEnumerableKeys,
  sanitizeCheckedPatches,
  sanitizePatches,
  sanitizeReplacementState
} from './utils';

type Options<T extends CreateState> = StoreOptions<T> | ClientStoreOptions<T>;

type StoreRuntime = {
  clientAction?: ClientActionFactory;
  collectActionPaths?: (state: unknown, isSliceStore: boolean) => Set<string>;
  share?: 'client' | 'main';
  wrapLocalAction?: LocalActionWrapper;
  validateInitialState?: (state: unknown, isSliceStore: boolean) => void;
  validatePatches?: (patches: Patches) => void;
  validateReplacementSource?: (state: unknown) => void;
  validateState?: (state: unknown) => void;
};

const namespaceMap = new Map<string, boolean>();
let hasWarnedAmbiguousFunctionMap = false;

const warnAmbiguousFunctionMap = () => {
  if (
    hasWarnedAmbiguousFunctionMap ||
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  hasWarnedAmbiguousFunctionMap = true;
  console.warn(
    [
      `sliceMode: 'auto' inferred slices from an object of functions.`,
      `This shape is ambiguous with a single store that only contains methods.`,
      `Use create({ ping() {} }, { sliceMode: 'single' }) for a plain method store,`,
      `or create({ counter: (set) => ({ count: 0 }) }, { sliceMode: 'slices' }) for slices.`
    ].join(' ')
  );
};

export const createStore = <T extends CreateState>(
  createState: Slice<T> | T,
  options: Options<T>,
  runtime: StoreRuntime = {}
) => {
  const { share, validatePatches, validateReplacementSource, validateState } =
    runtime;
  const store = {} as MiddlewareStore<T>;
  const internal = {
    sequence: 0,
    isBatching: false,
    listeners: new Set<Listener>(),
    destroyCallbacks: new Set<() => void>(),
    validatePatches,
    validateReplacementSource,
    validateState
  } as Internal<T>;
  internal.notifyStateChange = () => {
    invalidateReactivePaths(internal);
    internal.listeners.forEach((listener) => listener());
  };
  const name = options.name ?? defaultName;
  const shouldTrackName = share === 'main' && process.env.NODE_ENV !== 'test';
  const releaseStoreName = () => {
    if (shouldTrackName) {
      namespaceMap.delete(name);
    }
  };
  if (shouldTrackName) {
    if (namespaceMap.get(name)) {
      throw new Error(`Store name '${name}' is not unique.`);
    }
    namespaceMap.set(name, true);
  }

  try {
    const { setState, getState, replayPatches } = handleState(
      store,
      internal,
      options
    );
    const subscribe: Store<T>['subscribe'] = (listener) => {
      internal.assertAlive?.('subscribe');
      internal.listeners.add(listener);
      return () => internal.listeners.delete(listener);
    };
    let isDestroyed = false;
    internal.assertAlive = (operation) => {
      if (isDestroyed) {
        throw new Error(`${operation} cannot be called after store.destroy().`);
      }
    };
    const destroy: Store<T>['destroy'] = () => {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      let firstError: unknown;
      const callbacks = [...(internal.destroyCallbacks ?? [])];
      internal.destroyCallbacks?.clear();
      for (const callback of callbacks) {
        try {
          callback();
        } catch (error) {
          firstError ??= error;
        }
      }
      internal.listeners.clear();
      disposeStoreCommitRuntime(store);
      try {
        store.transport?.dispose();
      } catch (error) {
        firstError ??= error;
      } finally {
        releaseStoreName();
      }
      if (firstError) {
        throw firstError;
      }
    };
    const applyState = (
      state: T,
      patches: Patches | undefined,
      prepared = false,
      skipFinalValidation = false,
      knownInversePatches?: Patches,
      wantCommitPair = false
    ) => {
      internal.assertAlive?.('apply');
      internal.assertMutationAllowed?.('apply');
      if (patches && !prepared) {
        validatePatches?.(patches);
      }
      if (!prepared) {
        assertSafePatches(patches, 'store.apply()');
      }
      const safePatches = prepared ? patches : sanitizePatches(patches);
      const baseState =
        state === (internal.module as unknown) ? internal.rootState : state;
      if (baseState !== internal.rootState) {
        validateReplacementSource?.(baseState);
      }
      const appliedState = safePatches
        ? (applyWithMutative(baseState, safePatches) as T)
        : baseState;
      const nextState = prepared
        ? appliedState
        : sanitizeReplacementState(appliedState);
      if (!skipFinalValidation) {
        assertKnownStateShape(
          nextState,
          internal.rootState,
          internal.stateSchema,
          store.isSliceStore,
          {
            requireSliceRoots: true
          }
        );
        validateState?.(internal.getTransportState?.() ?? nextState);
      }
      // This assignment is the commit. Everything above it works on a
      // candidate, and `internal.rootState` still holds what every reader
      // sees, so a commit validator that throws here aborts the transition
      // whole -- and it does so for every entry that reaches this line:
      // `setState`, `store.apply()`, and a patch replay alike. Validating in
      // any one of those instead left the others as ways in.
      // The pair that describes this transition, built once and used for both
      // the validator and the commit `apply` publishes. A replacement carries
      // no pair of its own, so one is derived; a caller that already has the
      // other half -- after its own `store.patch` transform -- passes it in,
      // and the derivation is only for `store.apply(state, patches)`, which is
      // given patches and no inverse. It reads one target per patch rather
      // than the whole state.
      let pair: { patches: Patches; inversePatches: Patches } | undefined;
      if (wantCommitPair || hasStoreCommitValidators(store)) {
        const replacement = safePatches
          ? undefined
          : createRootReplacementPatches(
              internal.rootState as Record<PropertyKey, unknown>,
              nextState as Record<PropertyKey, unknown>
            );
        pair = {
          patches: (safePatches ?? replacement!.patches) as Patches,
          inversePatches: (knownInversePatches ??
            (safePatches
              ? createInversePatches(baseState, safePatches)
              : replacement!.inversePatches)) as Patches
        };
        validateStoreCommit(store, {
          state: nextState as T,
          patches: pair.patches,
          inversePatches: pair.inversePatches,
          source: getStoreCommitSource(store, 'external')
        });
      }
      // Carry the computed getters' immutable snapshot forward.
      //
      // A getter reads state through a frozen snapshot of the subtree it
      // touches, cached by object identity. A write makes that subtree a new
      // object, so without this the next read rebuilds it -- one pass over
      // every key of whatever the getter can reach, on every read after every
      // write. That is what took a getter over a thousand items from 45,000
      // reads a second to 3,800, and it took a getter reading one field of
      // those items down with it.
      //
      // Walking the patch paths instead is proportional to the change. This
      // existed already, in the `setState` fast path -- and a store whose
      // getter has ever been read has reactive path nodes, which is one of the
      // conditions that path requires be absent, so it stopped running the
      // moment the feature it serves was used. It belongs at the commit point,
      // where every write passes.
      const snapshotCache = internal.computedSnapshotCache;
      const previousSnapshot = snapshotCache?.get(
        internal.rootState as unknown as object
      );
      if (snapshotCache && previousSnapshot && safePatches?.length) {
        const snapshotPatches = createImmutableSnapshotPatches(
          safePatches,
          snapshotCache
        );
        finalizeImmutableStateSnapshot(
          nextState,
          applyWithMutative(previousSnapshot as any, snapshotPatches),
          safePatches,
          snapshotCache,
          internal.computedIdentityRequired
            ? internal.computedSnapshotSources
            : undefined
        );
      }
      internal.rootState = nextState;
      invalidateReactivePaths(internal, safePatches);
      if (internal.updateImmutable) {
        internal.updateImmutable(internal.rootState as T);
      } else {
        internal.listeners.forEach((listener) => listener());
      }
      return pair;
    };
    const apply: Store<T>['apply'] = (
      state = internal.rootState as T,
      patches
    ) => {
      // A transition through `apply` is published, in both of its forms. Only
      // the replacement form used to be, so `store.apply(state, patches)`
      // changed the state and told nobody: `@coaction/history` had nothing to
      // undo, `@coaction/sync` never queued it, and the local state moved away
      // from what the patch stream said it was.
      //
      // The exception is a caller inside Coaction that publishes the commit
      // itself. It has the source and the real inverse pair, where this only
      // has a derivation, so it says so rather than let a second and worse
      // description of the same transition go out.
      const observe =
        hasStoreCommitPublishers(store) && !ownsStoreCommit(store);
      const pair = applyState(state, patches, false, false, undefined, observe);
      if (!observe || !pair) {
        return;
      }
      const safePatches = sanitizeCheckedPatches(pair.patches, 'store.apply()');
      const safeInversePatches = sanitizeCheckedPatches(
        pair.inversePatches,
        'store.apply() inverse patches'
      );
      if (!safePatches.length && !safeInversePatches.length) {
        return;
      }
      internal.emitPatches?.(safePatches);
      publishStoreCommit(store, {
        state: internal.rootState as T,
        patches: safePatches,
        inversePatches: safeInversePatches,
        source: getStoreCommitSource(store, 'external')
      });
    };
    internal.applyValidatedPatches = (
      state,
      patches,
      skipFinalValidation,
      inversePatches
    ) => {
      if (store.apply !== apply) {
        store.apply(state, patches);
        return false;
      }
      applyState(state, patches, true, skipFinalValidation, inversePatches);
      return true;
    };
    const getPureState: Store<T>['getPureState'] = () =>
      internal.rootState as T;
    const isFunctionMapObject = () => {
      if (typeof createState !== 'object' || createState === null) {
        return false;
      }
      const values = getOwnEnumerableKeys(createState).map(
        (key) => (createState as Record<PropertyKey, unknown>)[key]
      );
      return (
        values.length > 0 &&
        values.every((value) => typeof value === 'function')
      );
    };
    const getIsSliceStore = () => {
      const sliceMode = options.sliceMode ?? 'auto';
      if (sliceMode === 'single') {
        return false;
      }
      if (sliceMode === 'slices') {
        if (!isFunctionMapObject()) {
          throw new Error(
            `sliceMode: 'slices' requires createState to be an object of slice functions.`
          );
        }
        return true;
      }
      if (isFunctionMapObject()) {
        warnAmbiguousFunctionMap();
        return true;
      }
      return false;
    };
    const isSliceStore = getIsSliceStore();
    Object.assign(store, {
      name,
      share: share ?? false,
      setState,
      getState,
      subscribe,
      destroy,
      apply,
      isSliceStore,
      getPureState
    } as Store<T>);
    const middlewareStore = applyMiddlewares(store, options.middlewares ?? []);
    if (middlewareStore !== store) {
      Object.assign(store, middlewareStore);
    }
    registerStorePatchReplayer(store, replayPatches);
    internal.assertAlive?.('store initialization');
    if (validatePatches && store.patch) {
      const patch = store.patch.bind(store);
      store.patch = (options) => {
        const result = patch(options);
        validatePatches(result.patches);
        return result;
      };
    }
    const initialState = getInitialState(store, createState, internal) as T;
    internal.assertAlive?.('store initialization');
    internal.sharedActionPaths = runtime.collectActionPaths?.(
      initialState,
      store.isSliceStore
    );
    if (!internal.getTransportState) {
      runtime.validateInitialState?.(initialState, store.isSliceStore);
    }
    store.getInitialState = () => initialState;
    internal.rootState = getRawState(
      store,
      internal,
      initialState,
      options,
      runtime.clientAction,
      runtime.wrapLocalAction
    ) as T;
    if (validatePatches && store.apply !== apply) {
      const applyWithAdapter = store.apply.bind(store);
      store.apply = (state, patches) => {
        internal.assertAlive?.('apply');
        internal.assertMutationAllowed?.('apply');
        if (
          typeof state !== 'undefined' &&
          state !== internal.rootState &&
          state !== internal.module
        ) {
          validateReplacementSource?.(state);
        }
        if (patches) {
          validatePatches(patches);
          assertSafePatches(patches, 'store.apply()');
        }
        applyWithAdapter(state, patches);
      };
    }
    internal.stateSchema = createStateSchema(
      internal.rootState,
      store.isSliceStore
    );
    validateState?.(internal.getTransportState?.() ?? internal.rootState);
    return { store, internal };
  } catch (error) {
    try {
      store.destroy?.();
    } catch (destroyError) {
      if (process.env.NODE_ENV === 'development') {
        console.error(destroyError);
      }
    }
    releaseStoreName();
    throw error;
  }
};
