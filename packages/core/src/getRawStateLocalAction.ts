import {
  create as createWithMutative,
  type Draft,
  isDraft,
  type Patches
} from 'mutative';
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
        // The draft, its backup and its finalizer are one transaction, and
        // they are store-global -- there is one `internal.rootState`, so there
        // can only be one open at a time.
        //
        // An async action holds its transaction open across every `await`. A
        // second action entered in that window closes it and opens its own,
        // which is fine; what was not is the first action then closing, on
        // resume, whatever transaction it found. That finalized the second
        // action's draft while it was still writing through it, so mutative
        // revoked the proxy and the second action failed on its next read with
        // `Cannot perform 'get' on a proxy that has been revoked` -- a crash in
        // an action that did nothing wrong, from another action it has never
        // heard of.
        let ownFinalize: (() => [T, Patches, Patches]) | undefined;
        const openTransaction = () => {
          internal.backupState = internal.rootState;
          const [draft, finalize] = createWithMutative(internal.rootState, {
            enablePatches: true
          });
          ownFinalize = finalize as () => [T, Patches, Patches];
          internal.finalizeDraft = ownFinalize;
          internal.rootState = draft as Draft<T>;
        };
        const handleResult = (isDrafted?: boolean) => {
          // Close only the transaction this action opened. When it belongs to
          // somebody else, this action's writes after the await went into it
          // and are committed with it; leaving it alone is what keeps the
          // owner's draft valid.
          if (internal.finalizeDraft !== ownFinalize) {
            return;
          }
          handleDraft(store, internal);
          if (isDrafted) {
            openTransaction();
          }
        };
        if (isDraft(internal.rootState)) {
          // A transaction is already open -- a nested action's, or an async
          // action's still awaiting. There is only one `internal.rootState`,
          // so it has to be closed before this one opens its own.
          handleDraft(store, internal);
        }
        // Whether to leave a transaction open afterwards is a question about
        // the caller, not about the draft: an enclosing action still on the
        // stack goes on writing and needs one to return to, while an action
        // suspended at an `await` does not -- it is not running, and the
        // transaction would be left with nobody to finalize it, which is how
        // `getPureState()` ends up returning a draft.
        const nested = (internal.mutableActionDepth ?? 0) > 0;
        openTransaction();
        let asyncResult: Promise<unknown> | undefined;
        internal.mutableActionDepth = (internal.mutableActionDepth ?? 0) + 1;
        try {
          result = fn.apply(getActionTarget(store, sliceKey), args);
          if (result instanceof Promise) {
            asyncResult = result;
          }
        } finally {
          internal.mutableActionDepth! -= 1;
          if (!asyncResult) {
            handleResult(nested);
          }
        }
        if (asyncResult) {
          return asyncResult.then(
            (value) => {
              handleResult(nested);
              return value;
            },
            (error) => {
              handleResult(nested);
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
