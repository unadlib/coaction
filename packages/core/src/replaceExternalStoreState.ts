import { scopeDraft } from './draft';
import type { Patches } from './patch';
import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { replaceOwnEnumerable, sanitizeCheckedPatches } from './utils';
import { publishStoreCommit } from './storeCommit';

type ReplaceExternalStoreStateOptions = {
  syncImmutable?: boolean;
};

export const replaceExternalStoreState = <T extends CreateState>(
  store: MiddlewareStore<T>,
  internal: Internal<T>,
  source: Record<PropertyKey, unknown>,
  { syncImmutable = true }: ReplaceExternalStoreStateOptions = {}
) => {
  internal.validateReplacementSource?.(source);
  const {
    state: nextState,
    patches,
    inversePatches
  } = scopeDraft(internal.rootState as unknown as T & object, (draft) => {
    replaceOwnEnumerable(draft as Record<PropertyKey, unknown>, source);
  });
  internal.validateState?.(nextState);
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
  if (!safePatches.length) {
    return;
  }
  const updateImmutable = internal.updateImmutable;
  if (!syncImmutable) {
    internal.updateImmutable = undefined;
  }
  try {
    store.apply(internal.rootState as T, safePatches);
  } finally {
    internal.updateImmutable = updateImmutable;
  }
  internal.emitPatches?.(safePatches);
  publishStoreCommit(store, {
    state: internal.rootState as T,
    patches: safePatches,
    inversePatches: safeInversePatches,
    source: 'external'
  });
};
