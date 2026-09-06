import {
  apply as applyWithMutative,
  type Draft,
  create as createWithMutative,
  isDraft,
  Patches
} from 'mutative';
import type {
  ClientStoreOptions,
  CreateState,
  MiddlewareStore,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import {
  createImmutableSnapshotPatches,
  finalizeImmutableStateSnapshot
} from './immutableState';
import {
  applyPatches,
  assertKnownStateShape,
  createInversePatches,
  createRootReplacementPatches,
  inverseNeedsDerivation,
  isSameStructure,
  shallowCloneOwnEnumerable,
  getOwnEnumerableKeys,
  mergeObject,
  sanitizeCheckedPatches,
  setOwnEnumerable
} from './utils';
import { handleDraft } from './handleDraft';
import { Computed } from './computed';
import { hasReactivePathNodes, invalidateReactivePaths } from './reactivePath';
import {
  hasStoreCommitListeners,
  applyWithOwnStoreCommit,
  prepareStoreCommit,
  publishStoreCommit,
  runWithStoreCommitSource,
  type StoreCommitSource,
  type StorePatchTransition
} from './storeCommit';

export const handleState = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  options: StoreOptions<T> | ClientStoreOptions<T>
): {
  setState: Store['setState'];
  getState: Store['getState'];
  replayPatches: (
    transition: StorePatchTransition,
    setState?: Store<T>['setState']
  ) => T;
} => {
  let defaultResultValidated = false;
  let pendingCommitSource: StoreCommitSource | undefined;
  const defaultUpdater: NonNullable<Parameters<Store['setState']>[1]> = (
    next
  ) => {
    defaultResultValidated = false;
    let producedState: T | undefined;
    const merge = (_next = next) => {
      if (_next !== next) {
        internal.validateState?.(_next);
      }
      assertKnownStateShape(
        _next,
        internal.rootState,
        internal.stateSchema,
        store.isSliceStore
      );
      mergeObject(internal.rootState, _next, store.isSliceStore);
    };
    const fn =
      typeof next === 'function'
        ? () => {
            const returnValue = next(internal.module);
            if (returnValue instanceof Promise) {
              returnValue.catch(() => undefined);
              throw new Error('setState with async function is not supported');
            }
            if (typeof returnValue === 'object' && returnValue !== null) {
              merge(returnValue);
            }
          }
        : merge;
    const enablePatches =
      Boolean(store.transport ?? (options as StoreOptions<T>).enablePatches) ||
      hasStoreCommitListeners(store) ||
      hasReactivePathNodes(internal);
    if (!enablePatches && internal.mutableInstance) {
      if (internal.actMutable) {
        internal.actMutable(() => {
          fn.apply(null);
        });
        defaultResultValidated = true;
        return [];
      }
      fn.apply(null);
      defaultResultValidated = true;
      return [];
    }
    internal.backupState = internal.rootState;
    let patches: Patches;
    let inversePatches: Patches;
    try {
      const result = createWithMutative(
        internal.rootState,
        (draft) => {
          internal.rootState = draft as Draft<T>;
          return fn.apply(null);
        },
        {
          enablePatches: true
        }
      );
      assertKnownStateShape(
        result[0],
        internal.backupState,
        internal.stateSchema,
        store.isSliceStore,
        {
          requireSliceRoots: true
        }
      );
      internal.validateState?.(internal.getTransportState?.() ?? result[0]);
      producedState = result[0] as T;
      patches = result[1];
      inversePatches = result[2];
      if (inverseNeedsDerivation(patches)) {
        // The pair needs work, and may not be usable at all.
        //
        // The runtime records patch paths positionally, so a recipe that drafts
        // a nested value, moves it within its parent array and then writes into
        // it records the position the value used to have. The pair then
        // describes a change to something that is no longer there, and applying
        // it -- which is how the transition is made, and how the inverse is
        // derived -- throws.
        //
        // The recipe is legal, and it succeeds on a store nobody is watching,
        // where no pair is produced at all. Failing once a listener, a
        // validator or an observer asks for patches would mean attaching a
        // devtool changes what an application is allowed to do. So a transition
        // the pair cannot describe is described the other way instead: as the
        // difference between the state before and the state the recipe
        // produced, one patch per changed top-level key.
        //
        // Coarser than it could be, and only for the transitions that need it.
        try {
          // Applying is not enough: a stale position can land somewhere that
          // exists, and then the pair applies cleanly to a different state than
          // the recipe produced. Both sides share every subtree the recipe did
          // not touch, so comparing them costs what changed.
          if (
            !isSameStructure(
              applyPatches(internal.backupState as T, patches),
              producedState
            )
          ) {
            throw new Error('patches do not describe this transition');
          }
          inversePatches = createInversePatches(
            internal.backupState as T,
            patches
          );
        } catch {
          const replacement = createRootReplacementPatches(
            internal.backupState as Record<PropertyKey, unknown>,
            producedState as Record<PropertyKey, unknown>
          );
          patches = replacement.patches as Patches;
          inversePatches = replacement.inversePatches as Patches;
        }
      }
    } finally {
      internal.rootState = internal.backupState;
    }
    const patch = store.patch;
    const finalPatches = patch
      ? patch({ patches, inversePatches })
      : { patches, inversePatches };
    if (!patch) {
      internal.validatePatches?.(finalPatches.patches);
    }
    const safePatches = sanitizeCheckedPatches(
      finalPatches.patches,
      'store.patch()'
    );
    const safeInversePatches = sanitizeCheckedPatches(
      finalPatches.inversePatches,
      'store.patch() inverse patches'
    );
    if (
      producedState &&
      safePatches.some(
        (patch) => typeof patch.value === 'object' && patch.value !== null
      ) &&
      prepareStoreCommit(store, {
        state: producedState,
        patches: safePatches,
        inversePatches: safeInversePatches,
        source: 'setState'
      })
    ) {
      runWithStoreCommitSource(store, 'setState', () => {
        store.apply(producedState);
      });
      defaultResultValidated = true;
      return [];
    }
    if (safePatches.length) {
      defaultResultValidated =
        internal.applyValidatedPatches?.(
          internal.rootState as T,
          safePatches,
          !patch,
          safeInversePatches
        ) ?? false;
      if (!internal.applyValidatedPatches) {
        applyWithOwnStoreCommit(store, () =>
          store.apply(internal.rootState as T, safePatches)
        );
      }
    } else {
      defaultResultValidated = true;
    }
    return [internal.rootState as any, safePatches, safeInversePatches];
  };
  const setState: Store['setState'] = (next, updater = defaultUpdater) => {
    const commitSource = pendingCommitSource ?? 'setState';
    pendingCommitSource = undefined;
    internal.assertAlive?.('setState');
    internal.assertMutationAllowed?.('setState');
    if (store.share === 'client') {
      throw new Error(
        `setState() cannot be called in the client store. To update the state, please trigger a store method with setState() instead.`
      );
    }
    if (internal.isBatching) {
      throw new Error('setState cannot be called within the updater');
    }
    if (next === null) {
      return [];
    }
    if (typeof next === 'object') {
      internal.validateState?.(next);
      assertKnownStateShape(
        next,
        internal.rootState,
        internal.stateSchema,
        store.isSliceStore
      );
    }
    internal.isBatching = true;
    if (
      !store.share &&
      !internal.validateState &&
      !(options as StoreOptions<T>).enablePatches &&
      !hasStoreCommitListeners(store) &&
      !hasReactivePathNodes(internal) &&
      !internal.mutableInstance &&
      updater === defaultUpdater
    ) {
      try {
        if (typeof next === 'function') {
          try {
            internal.backupState = internal.rootState;
            const snapshotCache = internal.computedSnapshotCache;
            const snapshotSources = internal.computedIdentityRequired
              ? internal.computedSnapshotSources
              : undefined;
            const snapshot = snapshotCache?.get(
              internal.rootState as unknown as object
            );
            const updateSnapshot = Boolean(snapshot && snapshotCache);
            const produced = createWithMutative(
              internal.rootState,
              (draft) => {
                internal.rootState = draft as Draft<T>;
                const returnValue = next(internal.module);
                if (returnValue instanceof Promise) {
                  returnValue.catch(() => undefined);
                  throw new Error(
                    'setState with async function is not supported'
                  );
                }
                if (typeof returnValue === 'object' && returnValue !== null) {
                  assertKnownStateShape(
                    returnValue,
                    internal.rootState,
                    internal.stateSchema,
                    store.isSliceStore
                  );
                  mergeObject(
                    internal.rootState,
                    returnValue,
                    store.isSliceStore
                  );
                }
              },
              {
                enablePatches: updateSnapshot
              }
            );
            const nextState = updateSnapshot
              ? (produced as [T, Patches, Patches])[0]
              : (produced as T);
            assertKnownStateShape(
              nextState,
              internal.backupState,
              internal.stateSchema,
              store.isSliceStore,
              {
                requireSliceRoots: true
              }
            );
            if (updateSnapshot) {
              const patches = (produced as [T, Patches, Patches])[1];
              const snapshotPatches = createImmutableSnapshotPatches(
                patches,
                snapshotCache!
              );
              const nextSnapshot = applyWithMutative(
                snapshot as T,
                snapshotPatches
              );
              finalizeImmutableStateSnapshot(
                nextState,
                nextSnapshot,
                patches,
                snapshotCache!,
                snapshotSources
              );
            }
            internal.rootState = nextState;
          } catch (error) {
            internal.rootState = internal.backupState;
            throw error;
          }
        } else {
          const copy = shallowCloneOwnEnumerable(internal.rootState as T);
          if (store.isSliceStore) {
            const nextRecord = next as Record<PropertyKey, unknown>;
            const copyRecord = copy as Record<PropertyKey, unknown>;
            for (const key of getOwnEnumerableKeys(nextRecord)) {
              if (!Object.prototype.hasOwnProperty.call(copyRecord, key)) {
                continue;
              }
              const sourceValue = nextRecord[key];
              if (typeof sourceValue !== 'object' || sourceValue === null) {
                continue;
              }
              const targetValue = copyRecord[key];
              if (typeof targetValue !== 'object' || targetValue === null) {
                continue;
              }
              const sliceCopy = shallowCloneOwnEnumerable(
                targetValue as Record<PropertyKey, unknown>
              );
              mergeObject(sliceCopy, sourceValue);
              setOwnEnumerable(copyRecord, key, sliceCopy);
            }
          } else {
            mergeObject(copy, next);
          }
          assertKnownStateShape(
            copy,
            internal.rootState,
            internal.stateSchema,
            store.isSliceStore,
            {
              requireSliceRoots: true
            }
          );
          internal.rootState = copy;
        }
        invalidateReactivePaths(internal);
        if (internal.updateImmutable) {
          internal.updateImmutable(internal.rootState as T);
        } else {
          internal.listeners.forEach((listener) => listener());
        }
        return [];
      } finally {
        internal.isBatching = false;
      }
    }
    let result: void | [] | [any, Patches, Patches];
    try {
      const isDrafted = internal.mutableInstance && isDraft(internal.rootState);
      if (isDrafted) {
        handleDraft(store, internal);
      }
      // What this transition is has been decided here, and the commit point is
      // several frames down. Announcing it on the store is how the rest of the
      // pipeline already learns it -- without this a commit validator was told
      // every transition was `external` while the listener for the same commit
      // was told `setState` or `replay`.
      result = runWithStoreCommitSource(store, commitSource, () =>
        updater(next)
      );
      if (internal.mutableInstance) {
        assertKnownStateShape(
          internal.rootState,
          internal.backupState ?? internal.rootState,
          internal.stateSchema,
          store.isSliceStore,
          {
            requireSliceRoots: true
          }
        );
      }
      const trustedDefaultResult =
        updater === defaultUpdater && defaultResultValidated;
      if (!trustedDefaultResult) {
        internal.validateState?.(
          internal.getTransportState?.() ?? internal.rootState
        );
      }
      if (isDrafted) {
        internal.backupState = internal.rootState;
        const [draft, finalize] = createWithMutative(
          internal.rootState as any,
          {
            enablePatches: true
          }
        );
        internal.finalizeDraft = finalize;
        internal.rootState = draft;
      }
    } finally {
      internal.isBatching = false;
    }
    const trustedDefaultResult =
      updater === defaultUpdater && defaultResultValidated;
    if (result?.length && !trustedDefaultResult) {
      internal.validatePatches?.(result[1]);
      result = [
        result[0],
        sanitizeCheckedPatches(result[1], 'setState updater result'),
        sanitizeCheckedPatches(result[2], 'setState updater inverse result')
      ];
    }
    if (result?.length === 3) {
      const [, patches, inversePatches] = result;
      internal.emitPatches?.(patches);
      if (patches.length || inversePatches.length) {
        publishStoreCommit(store, {
          state: internal.rootState as T,
          patches,
          inversePatches,
          source: commitSource
        });
      }
    }
    return result;
  };
  const replayPatches = (
    { patches, inversePatches }: StorePatchTransition,
    replaySetState: Store<T>['setState'] = setState
  ) => {
    const previousSource = pendingCommitSource;
    pendingCommitSource = 'replay';
    try {
      replaySetState(internal.rootState as T, () => {
        const inputPatches = patches.map((patch) => ({
          ...patch,
          path: Array.isArray(patch.path) ? [...patch.path] : patch.path
        })) as Patches;
        const inputInversePatches = inversePatches.map((patch) => ({
          ...patch,
          path: Array.isArray(patch.path) ? [...patch.path] : patch.path
        })) as Patches;
        const finalPatches = store.patch
          ? store.patch({
              patches: inputPatches,
              inversePatches: inputInversePatches
            })
          : {
              patches: inputPatches,
              inversePatches: inputInversePatches
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
          internal.applyValidatedPatches?.(
            internal.rootState as T,
            safePatches,
            false,
            safeInversePatches
          );
          if (!internal.applyValidatedPatches) {
            applyWithOwnStoreCommit(store, () =>
              store.apply(internal.rootState as T, safePatches)
            );
          }
        }
        return [internal.rootState as T, safePatches, safeInversePatches];
      });
      return internal.rootState as T;
    } finally {
      pendingCommitSource = previousSource;
    }
  };
  const getState = (
    deps?: (...args: any) => any,
    selector?: (...args: any) => any
  ) => (deps && selector ? new Computed(deps, selector) : internal.module);
  return { setState, getState, replayPatches };
};
