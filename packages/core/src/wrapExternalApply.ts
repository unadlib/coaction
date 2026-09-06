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
 * Put an adapter's `store.apply` back on the commit pipeline.
 *
 * An external adapter replaces `apply` outright, because only it knows how to
 * get a change onto its own runtime. What it should not also have to know is
 * that a transition through `apply` is a commit -- and none of them did, so
 * `store.apply()` on a MobX, Valtio or Pinia store changed the state and told
 * nobody. `@coaction/history` had nothing to undo, `@coaction/sync` never
 * queued it, and `Store.apply`'s own contract said the opposite.
 *
 * Three adapters implementing commit semantics separately is how they drift, so
 * this wraps whatever they installed: the pair is worked out before the change,
 * validators get their say while refusing still costs nothing, the adapter is
 * asked to make the change, and the commit is published. The adapter keeps only
 * the part that is actually its own.
 */
export const wrapExternalApply = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>
) => {
  const adapterApply = store.apply;
  store.apply = ((state?: T, patches?: Patches) => {
    const observing =
      hasStoreCommitPublishers(store) || hasStoreCommitValidators(store);
    if (!observing || ownsStoreCommit(store)) {
      adapterApply(state, patches);
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
      adapterApply(state, patches);
      return;
    }
    validateStoreCommit(store, {
      state: applyPatches(previous, safePatches) as T,
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: getStoreCommitSource(store, 'external')
    });
    adapterApply(state, patches);
    internal.emitPatches?.(safePatches);
    publishStoreCommit(store, {
      state: store.getPureState(),
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: getStoreCommitSource(store, 'external')
    });
  }) as Store<T>['apply'];
};
