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
        // Exactly one action owns the open draft, and ownership is a stack.
        //
        // An action takes the transaction from whoever held it on entry --
        // committing what they had written so far -- and hands a fresh one
        // back on the way out to the nearest one that has not finished. That
        // covers a nested call, whose caller is still on the stack and still
        // writing, and equally an async action suspended at an `await`, which
        // is not on the stack and is still going to write again.
        //
        // Following the chain rather than stopping at the immediate
        // predecessor is what makes three in flight work. Released out of
        // order, the one that finishes last can find the action it displaced
        // already done while something further down is still waiting, and
        // handing the transaction only to that one drops it. The next write
        // then goes straight to the mutable instance with no draft to record
        // it: the state stays right and the patch stream is missing it, so a
        // replay rebuilds a different store and history and sync never hear
        // about that write at all.
        const context: MutableActionContext = {
          active: true,
          displaced: internal.mutableTransactionOwner
        };
        /**
         * Close whatever transaction is open, whoever owns it.
         *
         * `handleDraft` runs commit validators, so this can throw -- and it
         * throws inside whichever action happens to be entering, about writes
         * that belong to another one. Leaving the store as it was found was the
         * worst of both: ownership still named the displaced action while its
         * draft had already been finalised, so it resumed writing through a
         * revoked proxy, and the writes it made afterwards reached the mutable
         * instance with no transaction to record them. The store then held a
         * state its own commits could not rebuild.
         *
         * The transaction closes either way. A refusal is remembered against
         * the action it belongs to and surfaces when that action finishes;
         * `handleDraft` restores the state before it validates, so what was
         * refused is already rolled back.
         */
        const closeTransaction = () => {
          const owner = internal.mutableTransactionOwner;
          try {
            handleDraft(store, internal);
          } catch (error) {
            if (!owner || owner === context) {
              throw error;
            }
            owner.failure = error;
          } finally {
            internal.mutableTransactionOwner = undefined;
          }
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
          context.active = false;
          if (internal.mutableTransactionOwner === context) {
            try {
              closeTransaction();
            } finally {
              // The hand-back happens whether or not closing succeeded. A
              // validator refusing this action's own writes throws from here,
              // and letting that skip the hand-back left an action further
              // down the chain still waiting with no transaction to write
              // into -- so its next write went to the mutable instance with
              // nothing to record it, which is the hole this ownership model
              // exists to close.
              let owner = context.displaced;
              while (owner && !owner.active) {
                owner = owner.displaced;
              }
              if (owner) {
                openTransactionFor(owner);
              }
            }
          }
          // A refusal collected while this action was suspended. It is its own,
          // so it fails here rather than in the action that found it.
          if (context.failure) {
            const failure = context.failure;
            context.failure = undefined;
            throw failure;
          }
        };
        if (isDraft(internal.rootState)) {
          // Something already has one open -- an enclosing action's, or an
          // async action's still awaiting. There is one `internal.rootState`,
          // so it has to be closed before this one opens its own.
          closeTransaction();
        }
        openTransactionFor(context);
        let asyncResult: Promise<unknown> | undefined;
        try {
          result = fn.apply(getActionTarget(store, sliceKey), args);
          if (result instanceof Promise) {
            asyncResult = result;
          }
        } finally {
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
