import {
  type Draft,
  create as createWithMutative,
  isDraft,
  Patches
} from 'mutative';
import type {
  ClientStoreOptions,
  CreateState,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { mergeObject } from './utils';
import { emit, handleDraft } from './asyncClientStore';
import { Computed } from './computed';

export const handleState = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  options: StoreOptions<T> | ClientStoreOptions<T>
): {
  setState: Store['setState'];
  getState: Store['getState'];
} => {
  const setState: Store['setState'] = (
    next,
    updater = (next) => {
      const merge = (_next = next) => {
        mergeObject(internal.rootState, _next, store.isSliceStore);
      };
      const fn =
        typeof next === 'function'
          ? () => {
              const returnValue = next(internal.module);
              if (returnValue instanceof Promise) {
                throw new Error(
                  'setState with async function is not supported'
                );
              }
              if (typeof returnValue === 'object' && returnValue !== null) {
                merge(returnValue);
              }
            }
          : merge;
      const enablePatches =
        store.transport ?? (options as StoreOptions<T>).enablePatches;
      if (!enablePatches) {
        if (internal.mutableInstance) {
          if (internal.actMutable) {
            internal.actMutable(() => {
              fn.apply(null);
            });
            return [];
          }
          fn.apply(null);
          return [];
        }
        // best performance by default for immutable state
        // TODO: supporting nested set functions?
        try {
          internal.backupState = internal.rootState;
          internal.rootState = createWithMutative(
            internal.rootState,
            (draft) => {
              internal.rootState = draft as Draft<any>;
              return fn.apply(null);
            }
          );
        } catch (error) {
          internal.rootState = internal.backupState;
          throw error;
        }
        if (internal.updateImmutable) {
          internal.updateImmutable(internal.rootState as T);
        } else {
          internal.listeners.forEach((listener) => listener());
        }
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
        patches = result[1];
        inversePatches = result[2];
      } finally {
        internal.rootState = internal.backupState;
      }
      const finalPatches = store.patch
        ? store.patch({ patches, inversePatches })
        : { patches, inversePatches };
      if (finalPatches.patches.length) {
        store.apply(internal.rootState as T, finalPatches.patches);
        if (!internal.mutableInstance) {
          if (internal.updateImmutable) {
            internal.updateImmutable(internal.rootState as T);
          } else {
            internal.listeners.forEach((listener) => listener());
          }
        }
      }
      return [internal.rootState as any, patches, inversePatches];
    }
  ) => {
    if (store.share === 'client') {
      throw new Error(
        `setState() cannot be called in the client store. To update the state, please trigger a store method with setState() instead.`
      );
    }
    if (internal.isBatching) {
      throw new Error('setState cannot be called within the updater');
    }
    internal.isBatching = true;
    let result: void | [] | [any, Patches, Patches];
    try {
      const isDrafted = internal.mutableInstance && isDraft(internal.rootState);
      if (isDrafted) {
        handleDraft(store, internal);
      }
      result = updater(next);
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
    emit(store, internal, result?.[1]);
    return result;
  };
  const getState = (
    deps?: (...args: any) => any,
    selector?: (...args: any) => any
  ) => (deps && selector ? new Computed(deps, selector) : internal.module);
  return { setState, getState };
};
