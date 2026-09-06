import type { Patches } from 'mutative';
import type { CreateState, Store } from './interface';
import type { Internal } from './internal';
import {
  applyPatches,
  createInversePatches,
  createRootReplacementPatches,
  sanitizeCheckedPatches,
  sanitizeReplacementState
} from './utils';
import {
  getStoreCommitSource,
  hasStoreCommitPublishers,
  hasStoreCommitValidators,
  ownsStoreCommit,
  publishStoreCommit,
  validateStoreCommit
} from './storeCommit';

/**
 * Commit a transition whose write goes into an external runtime.
 *
 * `store.apply` stays Coaction's for every store. When an adapter has said how
 * to write into its runtime, this is what `apply` does instead of assigning
 * state: work out the patch pair before the change, let commit validators
 * refuse it while refusing still costs nothing, ask the adapter to make the
 * change, and publish the commit.
 *
 * An adapter used to replace `store.apply` outright, which made commit
 * semantics its problem. None of them got it right -- `store.apply()` on a
 * MobX, Valtio or Pinia store changed the state and told nobody -- and putting
 * the pipeline back around whatever they installed produced three separate ways
 * to publish the same transition twice before it settled. It also discarded
 * anything middleware had wrapped `apply` with, since middleware runs first.
 * The adapter now supplies only the write.
 */
export const applyThroughExternalRuntime = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  externalApply: NonNullable<Internal<T>['externalApply']>
) => {
  return ((state?: T, patches?: Patches) => {
    const observing =
      hasStoreCommitPublishers(store) || hasStoreCommitValidators(store);
    if (!observing || ownsStoreCommit(store)) {
      externalApply(state, patches);
      return;
    }
    // A mutable instance has no previous value to hold on to, so the pair is
    // worked out against a snapshot taken now. It costs a copy of the state per
    // `apply`, and only when something is listening.
    const previous = sanitizeReplacementState(
      store.getPureState()
    ) as unknown as object;
    const pair = patches
      ? (() => {
          const safe = sanitizeCheckedPatches(patches, 'store.apply()');
          return {
            patches: safe,
            inversePatches: createInversePatches(previous, safe)
          };
        })()
      : createRootReplacementPatches(
          previous as Record<PropertyKey, unknown>,
          sanitizeReplacementState(state ?? store.getPureState()) as Record<
            PropertyKey,
            unknown
          >
        );
    const safePatches = sanitizeCheckedPatches(
      pair.patches as Patches,
      'store.apply()'
    );
    const safeInversePatches = sanitizeCheckedPatches(
      pair.inversePatches as Patches,
      'store.apply() inverse patches'
    );
    if (!safePatches.length && !safeInversePatches.length) {
      externalApply(state, patches);
      return;
    }
    validateStoreCommit(store, {
      state: applyPatches(previous, safePatches) as T,
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: getStoreCommitSource(store, 'external')
    });
    externalApply(state, patches);
    internal.emitPatches?.(safePatches);
    publishStoreCommit(store, {
      state: store.getPureState(),
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: getStoreCommitSource(store, 'external')
    });
  }) as Store<T>['apply'];
};
