import {
  create as createWithMutative,
  type Draft,
  isDraft,
  type Patches
} from 'mutative';
import { handleDraft } from './asyncClientStore';
import type {
  ClientStoreOptions,
  CreateState,
  MiddlewareStore,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { uuid } from './utils';

type CreateLocalActionOptions<T extends CreateState> = {
  fn: (...args: unknown[]) => unknown;
  internal: Internal<T>;
  key: string;
  options: StoreOptions<T> | ClientStoreOptions<T>;
  store: MiddlewareStore<T>;
  sliceKey?: string;
};

const getActionTarget = <T extends CreateState>(
  store: MiddlewareStore<T>,
  sliceKey?: string
) => {
  return sliceKey ? store.getState()[sliceKey] : store.getState();
};

export const createLocalAction = <T extends CreateState>({
  fn,
  internal,
  key,
  options,
  store,
  sliceKey
}: CreateLocalActionOptions<T>) => {
  return (...args: unknown[]) => {
    let actionId: string | undefined;
    let done: ((result: any) => void) | undefined;
    if (store.trace) {
      actionId = uuid();
      store.trace({
        method: key,
        parameters: args,
        id: actionId,
        sliceKey
      });
      done = (result: any) => {
        store.trace!({
          method: key,
          id: actionId!,
          result,
          sliceKey
        });
      };
    }
    const traceAction = <R>(run: () => R): R => {
      try {
        const result = run();
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              done?.(value);
              return value;
            },
            (error) => {
              done?.(error);
              throw error;
            }
          ) as R;
        }
        done?.(result);
        return result;
      } catch (error) {
        done?.(error);
        throw error;
      }
    };
    const enablePatches =
      store.transport ?? (options as StoreOptions<T>).enablePatches;
    return traceAction(() => {
      if (internal.mutableInstance && !internal.isBatching && enablePatches) {
        let result: any;
        const handleResult = (isDrafted?: boolean) => {
          handleDraft(store, internal);
          if (isDrafted) {
            internal.backupState = internal.rootState;
            const [draft, finalize] = createWithMutative(internal.rootState, {
              enablePatches: true
            });
            internal.finalizeDraft = finalize as () => [T, Patches, Patches];
            internal.rootState = draft as Draft<T>;
          }
        };
        const isDrafted = isDraft(internal.rootState);
        if (isDrafted) {
          handleResult();
        }
        internal.backupState = internal.rootState;
        const [draft, finalize] = createWithMutative(internal.rootState, {
          enablePatches: true
        });
        internal.finalizeDraft = finalize as () => [T, Patches, Patches];
        internal.rootState = draft as Draft<T>;
        let asyncResult: Promise<unknown> | undefined;
        try {
          result = fn.apply(getActionTarget(store, sliceKey), args);
          if (result instanceof Promise) {
            asyncResult = result;
          }
        } finally {
          if (!asyncResult) {
            handleResult(isDrafted);
          }
        }
        if (asyncResult) {
          return asyncResult.then(
            (value) => {
              handleResult(isDrafted);
              return value;
            },
            (error) => {
              handleResult(isDrafted);
              throw error;
            }
          );
        }
        return result;
      }
      if (internal.mutableInstance && internal.actMutable) {
        return internal.actMutable(() => {
          return fn.apply(getActionTarget(store, sliceKey), args);
        });
      }
      return fn.apply(getActionTarget(store, sliceKey), args);
    });
  };
};
