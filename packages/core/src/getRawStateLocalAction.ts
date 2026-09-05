import { type Draft, isCoactionDraft, openDraft } from './draft';
import type { Patches } from './patch';
import { handleDraft } from './handleDraft';
import type {
  ClientStoreOptions,
  CreateState,
  MiddlewareStore,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { uuid } from './utils';
import { hasStoreCommitListeners } from './storeCommit';

type CreateLocalActionOptions<T extends CreateState> = {
  fn: (...args: unknown[]) => unknown;
  internal: Internal<T>;
  key: PropertyKey;
  options: StoreOptions<T> | ClientStoreOptions<T>;
  store: MiddlewareStore<T>;
  sliceKey?: PropertyKey;
};

const getActionTarget = <T extends CreateState>(
  store: MiddlewareStore<T>,
  sliceKey?: PropertyKey
) => {
  return typeof sliceKey !== 'undefined'
    ? store.getState()[sliceKey]
    : store.getState();
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
    internal.assertAlive?.(`action ${String(key)}`);
    let actionId: string | undefined;
    let done: ((result: any) => void) | undefined;
    if (store.trace) {
      actionId = uuid();
      store.trace({
        method: String(key),
        parameters: args,
        id: actionId,
        sliceKey
      });
      done = (result: any) => {
        store.trace!({
          method: String(key),
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
      Boolean(store.transport ?? (options as StoreOptions<T>).enablePatches) ||
      hasStoreCommitListeners(store);
    return traceAction(() => {
      if (internal.mutableInstance && !internal.isBatching && enablePatches) {
        let result: any;
        const handleResult = (isDrafted?: boolean) => {
          handleDraft(store, internal);
          if (isDrafted) {
            internal.backupState = internal.rootState;
            const [draft, finalize] = openDraft(
              internal.rootState as unknown as T & object
            );
            internal.finalizeDraft = finalize as () => [T, Patches, Patches];
            internal.rootState = draft as Draft<T>;
          }
        };
        const isDrafted = isCoactionDraft(internal.rootState);
        if (isDrafted) {
          handleResult();
        }
        internal.backupState = internal.rootState;
        const [draft, finalize] = openDraft(
          internal.rootState as unknown as T & object
        );
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
