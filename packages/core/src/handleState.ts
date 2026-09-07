import {
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
import { updateImmutableStateSnapshot } from './immutableState';
import {
  applyPatches,
  assertKnownStateShape,
  createInversePatches,
  createRootReplacementPatches,
  createSnapshotPatches,
  inverseNeedsDerivation,
  isSameStructure,
  markLocalState,
  needsRootSnapshot,
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
  let patchBase: unknown;
  let patchBaseNeedsSnapshot = false;
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
    const snapshot =
      patchBase === internal.backupState && !internal.mutableInstance
        ? patchBaseNeedsSnapshot
        : needsRootSnapshot(internal.backupState);
    let nextNeedsSnapshot = false;
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
          // Preserve complete graph values and unrelated sibling edits without
          // positional cloning. This does not support editing inside a cyclic
          // draft or creating cycles from draft references.
          enablePatches: !snapshot,
          mark: markLocalState
        }
      );
      const pair = result as [T, Patches, Patches];
      producedState = snapshot ? (result as T) : pair[0];
      assertKnownStateShape(
        producedState,
        internal.backupState,
        internal.stateSchema,
        store.isSliceStore,
        {
          requireSliceRoots: true
        }
      );
      internal.validateState?.(internal.getTransportState?.() ?? producedState);
      patches = snapshot ? [] : pair[1];
      inversePatches = snapshot ? [] : pair[2];
      // Scalar replacements cannot introduce a new graph. Cache that fact on
      // the committed root so ordinary tracked writes stay proportional to the
      // patch paths. Object writes and shape changes recheck the complete graph.
      nextNeedsSnapshot =
        snapshot ||
        patches.some(
          (patch) =>
            patch.op !== 'replace' ||
            (typeof patch.value === 'object' && patch.value !== null) ||
            patch.path[patch.path.length - 1] === 'length'
        )
          ? needsRootSnapshot(producedState)
          : false;
      if (snapshot || nextNeedsSnapshot) {
        const replacement = createSnapshotPatches(
          internal.backupState,
          producedState
        );
        patches = replacement.patches;
        inversePatches = replacement.inversePatches;
      } else if (inverseNeedsDerivation(patches)) {
        // Moving a drafted array value can leave its patch at a stale position.
        // Replay must match the produced state; otherwise use changed root keys.
        try {
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
    const hasObjectValues = safePatches.some(
      (patch) => typeof patch.value === 'object' && patch.value !== null
    );
    if (
      producedState &&
      hasObjectValues &&
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
          safeInversePatches,
          // Normalization cannot alter scalar payloads. Keep the verified
          // producer result instead of drafting the same transition again.
          // Object payloads and middleware transforms still take the apply path.
          !patch && !hasObjectValues ? producedState : undefined
        ) ?? false;
      if (!internal.applyValidatedPatches) {
        applyWithOwnStoreCommit(store, () =>
          store.apply(internal.rootState as T, safePatches)
        );
      }
    } else {
      defaultResultValidated = true;
    }
    // Middleware may transform the pair, so its output needs a fresh scan the
    // next time it becomes a draft base.
    patchBase = patch ? undefined : internal.rootState;
    patchBaseNeedsSnapshot = nextNeedsSnapshot;
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
                enablePatches: updateSnapshot,
                mark: markLocalState
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
              updateImmutableStateSnapshot(
                nextState,
                snapshot,
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
            enablePatches: true,
            mark: markLocalState
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
