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
import type { Internal, MutableActionContext } from './internal';
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
        // Exactly one action owns the open draft, and ownership moves.
        //
        // A nested action takes it on entry -- committing what the enclosing
        // action had written so far -- and hands a fresh one back on the way
        // out, because the enclosing action is still on the stack and still
        // writing. An action suspended at an `await` is not on the stack, so
        // it gets nothing back: whoever runs next takes ownership, and the
        // suspended action's writes after the await join that transaction and
        // are committed with it.
        //
        // Ownership is what says who may finalize. Without it an action
        // finalized whatever transaction it found on resume, revoking a draft
        // another action was still writing through. Keyed to the transaction
        // rather than to the action, a nested action's hand-back belonged to
        // nobody, and the enclosing action's remaining writes were never
        // committed at all.
        const enclosing = internal.mutableActionContext;
        const context: MutableActionContext = { running: true };
        const closeTransaction = () => {
          handleDraft(store, internal);
          internal.mutableTransactionOwner = undefined;
        };
        const openTransactionFor = (owner: MutableActionContext) => {
          internal.backupState = internal.rootState;
          const [draft, finalize] = createWithMutative(internal.rootState, {
            enablePatches: true
          });
          internal.finalizeDraft = finalize as () => [T, Patches, Patches];
          internal.rootState = draft as Draft<T>;
          internal.mutableTransactionOwner = owner;
        };
        const handleResult = () => {
          if (internal.mutableTransactionOwner !== context) {
            return;
          }
          closeTransaction();
          if (enclosing?.running) {
            openTransactionFor(enclosing);
          }
        };
        if (isDraft(internal.rootState)) {
          // Something already has one open -- an enclosing action's, or an
          // async action's still awaiting. There is one `internal.rootState`,
          // so it has to be closed before this one opens its own.
          closeTransaction();
        }
        openTransactionFor(context);
        internal.mutableActionContext = context;
        let asyncResult: Promise<unknown> | undefined;
        try {
          result = fn.apply(getActionTarget(store, sliceKey), args);
          if (result instanceof Promise) {
            asyncResult = result;
          }
        } finally {
          internal.mutableActionContext = enclosing;
          context.running = false;
          if (!asyncResult) {
            handleResult();
          }
        }
        if (asyncResult) {
          return asyncResult.then(
            (value) => {
              handleResult();
              return value;
            },
            (error) => {
              handleResult();
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
