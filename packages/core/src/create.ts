import {
  type Draft,
  create as createWithMutative,
  apply,
  isDraft,
  Patches
} from 'mutative';
import { createTransport, type Transport } from 'data-transport';
import type {
  ExternalEvents,
  InternalEvents,
  ISlices,
  Listener,
  Slice,
  SliceState,
  Store,
  StoreOptions,
  StoreReturn,
  AsyncStoreOption
} from './interface';
import { bindSymbol } from './constant';
import { createAsyncStore } from './asyncStore';

export function createBinder<F = (...args: any[]) => any>({
  handleState,
  handleStore
}: {
  /**
   * handleState is a function to handle the state object.
   */
  handleState: <T extends object = object>(
    state: T
  ) => {
    /**
     * copyState is a copy of the state object.
     */
    copyState: T;
    /**
     * key is the key of the state object.
     */
    key?: keyof T;
    /**
     * bind is a function to bind the state object.
     */
    bind: (state: T) => T;
  };
  /**
   * handleStore is a function to handle the store object.
   */
  handleStore: (store: Store<object>, rawState: object, state: object) => void;
}) {
  return (<T extends object>(state: T): T => {
    const { copyState, key, bind } = handleState(state);
    const value: any = key ? copyState[key] : copyState;
    value[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  }) as F;
}

const workerType = globalThis.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : globalThis.WorkerGlobalScope
    ? 'WorkerInternal'
    : null;

function create<T extends ISlices>(
  createState: Slice<T>,
  options?: StoreOptions
): StoreReturn<T>;
function create<T extends Record<string, Slice<any>>>(
  createState: T,
  options?: StoreOptions
): StoreReturn<SliceState<T>, true>;
function create<T extends { name?: string }>(
  createState: any,
  options: StoreOptions = {}
): any {
  const _workerType = (options.workerType ?? workerType) as typeof workerType;
  const createStore = ({ share }: { share?: 'client' | 'main' }) => {
    let module: T;
    let rootState: T | Draft<T>;
    let backupState: T | Draft<T>;
    // TODO: fix the type of finalizeDraft
    let finalizeDraft: () => [T, Patches, Patches];
    let mutableInstance: any;
    let store: Store<any>;
    // TODO: consider to remove this, about name property should be required.
    const name = options.id ?? 'default';
    let transport: Transport<{
      emit: InternalEvents;
      listen: ExternalEvents;
    }> | null = null;
    let sequence = 0;
    const listeners = new Set<Listener>();
    const emit = (patches?: Patches) => {
      if (transport && patches?.length) {
        sequence += 1;
        console.log('sequence', sequence);
        transport.emit('update', {
          patches: patches,
          sequence
        });
      }
    };
    let isBatching = false;
    const setState: Store<T>['setState'] = (
      next,
      updater = (next) => {
        const merge = (_next = next) => {
          if (store.isSliceStore) {
            if (typeof _next === 'object' && _next !== null) {
              for (const key in _next) {
                if (
                  typeof _next[key as keyof typeof _next] === 'object' &&
                  _next[key as keyof typeof _next] !== null
                ) {
                  Object.assign(
                    (rootState as any)[key],
                    _next[key as keyof typeof _next]
                  );
                }
              }
            }
          } else {
            Object.assign(rootState, _next);
          }
        };
        const fn =
          typeof next === 'function'
            ? () => {
                const returnValue = next(module as Draft<T>);
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
          if (mutableInstance) {
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
          rootState = createWithMutative(rootState, () => {
            return fn.apply(null);
          });
          listeners.forEach((listener) => listener());
          return [];
        }
        backupState = rootState;
        const [, patches, inversePatches] = createWithMutative(
          rootState as T,
          (draft) => {
            rootState = draft;
            return fn.apply(null);
          },
          {
            // mark: () => 'immutable',
            enablePatches: true
          }
        );
        rootState = backupState;
        const finalPatches = store.patch
          ? store.patch({ patches, inversePatches })
          : { patches, inversePatches };
        if (finalPatches.patches.length) {
          console.log('ddddd');
          store.apply(rootState, finalPatches.patches);
          if (!mutableInstance) {
            listeners.forEach((listener) => listener());
          }
        }
        return [rootState as T, patches, inversePatches];
      }
    ) => {
      if (isBatching) {
        throw new Error('setState cannot be called within the updater');
      }
      isBatching = true;
      let result: void | [] | [T, Patches, Patches];
      try {
        const isDrafted = mutableInstance && isDraft(rootState);
        if (isDrafted) {
          rootState = backupState;
          const [, patches, inversePatches] = finalizeDraft();
          const finalPatches = store.patch
            ? store.patch({ patches, inversePatches })
            : { patches, inversePatches };
          if (finalPatches.patches.length) {
            store.apply(rootState, finalPatches.patches);
            // with mutableInstance, 3rd party model will send update notifications on its own after store.apply
            emit(finalPatches.patches);
          }
        }
        result = updater(next);
        if (isDrafted) {
          backupState = rootState;
          const [draft, finalize] = createWithMutative(rootState as T, {
            // mark: () => 'immutable',
            enablePatches: true
          });
          finalizeDraft = finalize;
          rootState = draft as any;
        }
      } finally {
        isBatching = false;
      }
      emit(result?.[1]);
    };
    const getState = () => module;
    const getInitialState = () => initialState;
    const subscribe: Store<T>['subscribe'] = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const destroy = () => {
      // TODO: implement more robust destroy method
      listeners.clear();
      transport?.dispose();
    };
    store = {
      id: name,
      share,
      setState,
      getState,
      getInitialState,
      subscribe,
      destroy,
      apply: (state = rootState, patches) => {
        console.log('apply', { state, patches });
        rootState = patches ? apply(state, patches) : state;
        listeners.forEach((listener) => listener());
      },
      isSliceStore: typeof createState === 'object'
    };
    const makeState = (fn: (...args: any[]) => any) => {
      let state = fn(store.setState, store.getState, store);
      if (typeof state === 'function') {
        state = state();
      }
      if (state[bindSymbol]) {
        const rawState = state[bindSymbol].bind(state);
        state[bindSymbol].handleStore(store, rawState, state);
        return rawState;
      }
      return state;
    };
    const initialState = store.isSliceStore
      ? Object.entries(createState).reduce(
          (stateTree, [key, value]) =>
            Object.assign(stateTree, { [key]: makeState(value as Slice<T>) }),
          {} as ISlices<Slice<T>>
        )
      : makeState(createState as Slice<T>);
    const rawState = {} as any;
    const handle = (_rawState: any, _initialState: any, sliceKey?: string) => {
      mutableInstance = store.toRaw?.(_initialState);
      console.log('_initialState', _initialState);
      const descriptors = Object.getOwnPropertyDescriptors(_initialState);
      Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          if (typeof descriptor.value !== 'function') {
            if (mutableInstance) {
              Object.defineProperty(_rawState, key, {
                get: () => mutableInstance[key],
                set: (value) => {
                  mutableInstance[key] = value;
                },
                enumerable: true
              });
            } else {
              _rawState[key] = descriptor.value;
            }
            // handle state property
            delete descriptor.value;
            delete descriptor.writable;
            if (sliceKey) {
              descriptor.get = () => (rootState as any)[sliceKey][key];
              descriptor.set = (value: any) => {
                (rootState as any)[sliceKey][key] = value;
              };
            } else {
              descriptor.get = () => (rootState as any)[key];
              descriptor.set = (value: any) => {
                (rootState as any)[key] = value;
              };
            }
          } else if (share === 'client') {
            descriptor.value = (...args: any[]) => {
              const keys = sliceKey ? [sliceKey, key] : [key];
              console.log('execute', { keys, args });
              return store.transport!.emit('execute', keys, args);
            };
          } else {
            const fn = descriptor.value;
            descriptor.value = (...args: any[]) => {
              const enablePatches = store.transport ?? options.enablePatches;
              if (mutableInstance && !isBatching && enablePatches) {
                let result: any;
                const handleResult = (isDrafted?: boolean) => {
                  rootState = backupState;
                  const [, patches, inversePatches] = finalizeDraft();
                  const finalPatches = store.patch
                    ? store.patch({ patches, inversePatches })
                    : { patches, inversePatches };
                  if (finalPatches.patches.length) {
                    store.apply(rootState, finalPatches.patches);
                    // with mutableInstance, 3rd party model will send update notifications on its own after store.apply
                    emit(finalPatches.patches);
                  }
                  if (isDrafted) {
                    backupState = rootState;
                    const [draft, finalize] = createWithMutative(
                      rootState as T,
                      {
                        // mark: () => 'immutable',
                        enablePatches: true
                      }
                    );
                    finalizeDraft = finalize;
                    rootState = draft as any;
                  }
                };
                const isDrafted = isDraft(rootState);
                if (isDrafted) {
                  handleResult();
                }
                backupState = rootState;
                const [draft, finalize] = createWithMutative(rootState as T, {
                  // mark: () => 'immutable',
                  enablePatches: true
                });
                finalizeDraft = finalize;
                rootState = draft as any;
                result = fn.apply(
                  sliceKey ? store.getState()[sliceKey] : store.getState(),
                  args
                );
                if (result instanceof Promise) {
                  // if (process.env.NODE_ENV === 'development') {
                  //   console.warn(
                  //     'It will be combined with the next state in the async function.'
                  //   );
                  // }
                  return result.finally(() => handleResult(isDrafted));
                }
                handleResult(isDrafted);
                return result;
              }
              if (mutableInstance && store.act) {
                return store.act(() => {
                  return fn.apply(
                    sliceKey ? store.getState()[sliceKey] : store.getState(),
                    args
                  );
                });
              }
              return fn.apply(
                sliceKey ? store.getState()[sliceKey] : store.getState(),
                args
              );
            };
          }
        }
      });
      // TODO: improve perf
      // it should be a immutable state
      const slice = Object.defineProperties({} as T, descriptors);
      return slice;
    };
    if (store.isSliceStore) {
      module = {} as T;
      Object.entries(initialState).forEach(([key, value]) => {
        rawState[key] = {};
        (module as any)[key] = handle(rawState[key], value, key);
      });
    } else {
      module = handle(rawState, initialState);
    }
    rootState = rawState;
    // in worker, the transport is the worker itself
    transport =
      options.transport ??
      (_workerType
        ? createTransport(_workerType, {
            prefix: name
          })
        : null);
    if (transport) {
      if (options.enablePatches === false) {
        throw new Error(`enablePatches: true is required for the transport`);
      }
      transport.listen('execute', async (keys, args) => {
        console.log('execute', { keys, args });
        let base = store.getState();
        let obj = base;
        for (const key of keys) {
          base = base[key];
          if (typeof base === 'function') {
            base = base.bind(obj);
          }
          obj = base;
        }
        return base(...args);
      });
      transport.listen('fullSync', async () => {
        console.log('fullSync', rootState);
        return {
          state: JSON.stringify(rootState),
          sequence
        };
      });
      store.transport = transport;
    }
    return store;
  };
  const store = createStore({
    share: _workerType || options.transport ? 'main' : undefined
  });
  return Object.assign((asyncStoreOption: AsyncStoreOption) => {
    if (!asyncStoreOption) return store.getState();
    return createAsyncStore(createStore, asyncStoreOption);
  }, store);
}

export { create };
