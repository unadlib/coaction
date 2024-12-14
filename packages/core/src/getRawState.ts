import {
  create as createWithMutative,
  type Draft,
  isDraft,
  type Patches
} from 'mutative';
import { Computed, createSelectorWithArray } from './computed';
import type {
  ClientStoreOptions,
  CreateState,
  Store,
  StoreOptions
} from './interface';
import type { Internal } from './internal';
import { handleDraft } from './asyncClientStore';
import { uuid } from './utils';

export const getRawState = <T extends CreateState>(
  store: Store<T>,
  internal: Internal<T>,
  initialState: any,
  options: StoreOptions<T> | ClientStoreOptions<T>
) => {
  const rawState = {} as Record<string, any>;
  const handle = (_rawState: any, _initialState: any, sliceKey?: string) => {
    internal.mutableInstance = store.toRaw?.(_initialState);
    const descriptors = Object.getOwnPropertyDescriptors(_initialState);
    Object.entries(descriptors).forEach(([key, descriptor]) => {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        if (typeof descriptor.value !== 'function') {
          const isComputed = descriptor.value instanceof Computed;
          if (internal.mutableInstance) {
            Object.defineProperty(_rawState, key, {
              get: () => internal.mutableInstance[key],
              set: (value) => {
                internal.mutableInstance[key] = value;
              },
              enumerable: true
            });
          } else if (!isComputed) {
            _rawState[key] = descriptor.value;
          }
          if (isComputed) {
            if (internal.mutableInstance) {
              throw new Error(
                'Computed is not supported with mutable instance'
              );
            }
            // manually handle computed property
            const { deps, fn } = descriptor.value as Computed;
            const depsCallbackSelector = createSelectorWithArray(
              () => [internal.rootState],
              () => {
                return deps(internal.module as Store<T>['getState']);
              }
            );
            const selector = createSelectorWithArray(
              (that) => depsCallbackSelector.call(that),
              fn
            );
            descriptor.get = function () {
              return selector.call(this);
            };
          } else {
            if (sliceKey) {
              descriptor.get = () => (internal.rootState as any)[sliceKey][key];
              descriptor.set = (value: unknown) => {
                (internal.rootState as any)[sliceKey][key] = value;
              };
            } else {
              descriptor.get = () => (internal.rootState as any)[key];
              descriptor.set = (value: unknown) => {
                (internal.rootState as any)[key] = value;
              };
            }
          }
          // handle state property
          delete descriptor.value;
          delete descriptor.writable;
        } else if (store.share === 'client') {
          descriptor.value = (...args: unknown[]) => {
            let actionId: string | undefined;
            let done: ((result: any) => void) | undefined;
            if (store.trace) {
              actionId = uuid();
              store.trace!({
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
            const keys = sliceKey ? [sliceKey, key] : [key];
            // emit the action to worker or main thread execute
            return store
              .transport!.emit('execute', keys, args)
              .then((result: any) => {
                if (result?.$$Error) {
                  done?.(result);
                  throw new Error(result.$$Error);
                }
                done?.(result);
                return result;
              });
          };
        } else {
          const fn = descriptor.value;
          descriptor.value = (...args: unknown[]) => {
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
            const enablePatches =
              store.transport ?? (options as StoreOptions<T>).enablePatches;
            if (
              internal.mutableInstance &&
              !internal.isBatching &&
              enablePatches
            ) {
              let result: any;
              const handleResult = (isDrafted?: boolean) => {
                handleDraft(store, internal);
                if (isDrafted) {
                  internal.backupState = internal.rootState;
                  const [draft, finalize] = createWithMutative(
                    internal.rootState,
                    {
                      enablePatches: true
                    }
                  );
                  internal.finalizeDraft = finalize as () => [
                    T,
                    Patches,
                    Patches
                  ];
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
              try {
                result = fn.apply(
                  sliceKey ? store.getState()[sliceKey] : store.getState(),
                  args
                );
              } finally {
                if (result instanceof Promise) {
                  // if (process.env.NODE_ENV === 'development') {
                  //   console.warn(
                  //     'It will be combined with the next state in the async function.'
                  //   );
                  // }
                  return result.finally(() => {
                    const result = handleResult(isDrafted);
                    done?.(result);
                    return result;
                  });
                }
                handleResult(isDrafted);
              }
              done?.(result);
              return result;
            }
            if (internal.mutableInstance && store.act) {
              const result = store.act(() => {
                return fn.apply(
                  sliceKey ? store.getState()[sliceKey] : store.getState(),
                  args
                );
              });
              done?.(result);
              return result;
            }
            const result = fn.apply(
              sliceKey ? store.getState()[sliceKey] : store.getState(),
              args
            );
            done?.(result);
            return result;
          };
        }
      }
    });
    // it should be a immutable state
    const slice = Object.defineProperties({}, descriptors);
    return slice;
  };
  if (store.isSliceStore) {
    internal.module = {} as T;
    Object.entries(initialState).forEach(([key, value]) => {
      rawState[key] = {};
      internal.module[key] = handle(rawState[key], value, key);
    });
  } else {
    internal.module = handle(rawState, initialState) as T;
  }
  return rawState;
};
