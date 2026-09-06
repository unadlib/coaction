import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { sanitizeCheckedPatches } from './utils';
import {
  applyWithOwnStoreCommit,
  publishStoreCommit,
  validateStoreCommit
} from './storeCommit';

export const handleDraft = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>
) => {
  internal.rootState = internal.backupState;
  const [nextState, patches, inversePatches] = internal.finalizeDraft();
  const finalPatches = store.patch
    ? store.patch({ patches, inversePatches })
    : { patches, inversePatches };
  const safePatches = sanitizeCheckedPatches(
    finalPatches.patches,
    'store.patch()'
  );
  const safeInversePatches = sanitizeCheckedPatches(
    finalPatches.inversePatches,
    'store.patch() inverse patches'
  );
  if (safePatches.length) {
    // An action on a mutable instance writes into the draft, not the instance;
    // `store.apply` below is what puts the change onto the object. So this
    // transition does have a point before it is committed, and a validator
    // that throws here leaves the instance holding what it held before the
    // action ran. Without this the validator was skipped outright, because an
    // adapter replaces `store.apply` and the check at the core commit point is
    // never reached.
    //
    // Mutation made on the instance directly, outside an action, is the case
    // that genuinely has no such point.
    validateStoreCommit(store, {
      state: nextState,
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: 'mutableAction'
    });
    applyWithOwnStoreCommit(store, () =>
      store.apply(internal.rootState as T, safePatches)
    );
    internal.emitPatches?.(safePatches);
    publishStoreCommit(store, {
      state: internal.rootState as T,
      patches: safePatches,
      inversePatches: safeInversePatches,
      source: 'mutableAction'
    });
  }
};
