import {
  type Draft,
  create as createWithMutative,
  isDraft,
  Patches
} from 'mutative';
import { Store, StoreOptions } from './interface';
import { Internal } from './internal';
import { mergeObject } from './utils';
import { emit, handleDraft } from './asyncStore';
import { Computed } from './computed';

export const handleState = (
  store: Store<any>,
  internal: Internal<any>,
  options: StoreOptions
) => {
  const setState: Store<any>['setState'] = (
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
      const enablePatches = store.transport ?? options.enablePatches;
      if (!enablePatches) {
        if (internal.mutableInstance) {
          if (store.act) {
            store.act(() => {
              fn.apply(null);
            });
            return [];
          }
          fn.apply(null);
          return [];
        }
        // best performance by default for immutable state
        // TODO: supporting nested set functions?
        internal.rootState = createWithMutative(internal.rootState, (draft) => {
          internal.rootState = draft as Draft<any>;
          return fn.apply(null);
        });
        internal.listeners.forEach((listener) => listener());
        return [];
      }
      internal.backupState = internal.rootState;
      const [, patches, inversePatches] = createWithMutative(
        internal.rootState,
        (draft) => {
          internal.rootState = draft;
          return fn.apply(null);
        },
        {
          // mark: () => 'immutable',
          enablePatches: true
        }
      );
      internal.rootState = internal.backupState;
      const finalPatches = store.patch
        ? store.patch({ patches, inversePatches })
        : { patches, inversePatches };
      if (finalPatches.patches.length) {
        store.apply(internal.rootState, finalPatches.patches);
        if (!internal.mutableInstance) {
          internal.listeners.forEach((listener) => listener());
        }
      }
      return [internal.rootState as any, patches, inversePatches];
    }
  ) => {
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
            // mark: () => 'immutable',
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
  };
  const getState = (
    deps?: (...args: any) => any,
    selector?: (...args: any) => any
  ) => (deps && selector ? new Computed(deps, selector) : internal.module);
  return { setState, getState };
};
