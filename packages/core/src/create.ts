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
  WorkerOptions,
  TransportOptions,
  AsyncStoreOption
} from './interface';

const bindSymbol = Symbol('bind');

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
  handleStore: (api: Store<object>, rawState: object, state: object) => void;
}): F {
  return (<T extends object>(state: T): T => {
    const { copyState, key, bind } = handleState(state);
    const value = key ? copyState[key] : copyState;
    (value as any)[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  }) as any;
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
  options: any = {}
): any {
  const _workerType = (options.workerType ?? workerType) as typeof workerType;
  const createApi = ({
    share
  }: {
    share?: 'client' | 'main';
  } = {}) => {
    let module: T;
    let rootState: T | Draft<T>;
    let backupState: T | Draft<T>;
    // TODO: fix the type of finalizeDraft
    let finalizeDraft: () => [T, Patches, Patches];
    let mutableInstance: any;
    let api: Store<any>;
    let name: string;
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
        if (mutableInstance && typeof next !== 'function') {
          throw new Error(
            'setState only supports the function in mutable mode'
          );
        }
        const merge = (_next = next) => {
          if (api.isSliceStore) {
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
        const enablePatches = api.transport ?? options.enablePatches;
        if (!enablePatches) {
          if (mutableInstance) {
            if (api.act) {
              api.act(() => {
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
        if (api.transport && options.enablePatches === false) {
          // TODO: dev warning
          console.warn(`enablePatches is required for the transport`);
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
        const finalPatches = api.patch
          ? api.patch({ patches, inversePatches })
          : { patches, inversePatches };
        if (finalPatches.patches.length) {
          api.apply(rootState, finalPatches.patches);
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
          const finalPatches = api.patch
            ? api.patch({ patches, inversePatches })
            : { patches, inversePatches };
          if (finalPatches.patches.length) {
            api.apply(rootState, finalPatches.patches);
            // with mutableInstance, 3rd party model will send update notifications on its own after api.apply
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
    api = {
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
      let state = fn(api.setState, api.getState, api);
      if (typeof state === 'function') {
        state = state();
      }
      if (state[bindSymbol]) {
        const rawState = state[bindSymbol].bind(state);
        state[bindSymbol].handleStore(api, rawState, state);
        return rawState;
      }
      return state;
    };
    const initialState = api.isSliceStore
      ? Object.entries(createState).reduce(
          (stateTree, [key, value]) => {
            const state = key === 'name' ? value : makeState(value as Slice<T>);
            Object.assign(stateTree, { [key]: state });
            return stateTree;
          },
          {} as ISlices<Slice<T>>
        )
      : makeState(createState as Slice<T>);
    const rawState = {} as any;
    const handle = (_rawState: any, _initialState: any, _key?: string) => {
      mutableInstance = api.toRaw?.(_initialState);
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
            if (key !== 'name') {
              delete descriptor.value;
              delete descriptor.writable;
              if (_key) {
                descriptor.get = () => (rootState as any)[_key][key];
                descriptor.set = (value: any) => {
                  (rootState as any)[_key][key] = value;
                };
              } else {
                descriptor.get = () => (rootState as any)[key];
                descriptor.set = (value: any) => {
                  (rootState as any)[key] = value;
                };
              }
            }
          } else if (share === 'client') {
            descriptor.value = (...args: any[]) => {
              const keys = _key ? [_key, key] : [key];
              console.log('execute', { keys, args });
              return api.transport!.emit('execute', keys, args);
            };
          } else {
            const fn = descriptor.value;
            descriptor.value = (...args: any[]) => {
              const enablePatches = api.transport ?? options.enablePatches;
              if (mutableInstance && !isBatching && enablePatches) {
                let result: any;
                const handleResult = (isDrafted?: boolean) => {
                  rootState = backupState;
                  const [, patches, inversePatches] = finalizeDraft();
                  const finalPatches = api.patch
                    ? api.patch({ patches, inversePatches })
                    : { patches, inversePatches };
                  if (finalPatches.patches.length) {
                    api.apply(rootState, finalPatches.patches);
                    // with mutableInstance, 3rd party model will send update notifications on its own after api.apply
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
                  _key ? api.getState()[_key] : api.getState(),
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
              if (mutableInstance && api.act) {
                return api.act(() => {
                  return fn.apply(
                    _key ? api.getState()[_key] : api.getState(),
                    args
                  );
                });
              }
              return fn.apply(
                _key ? api.getState()[_key] : api.getState(),
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
    if (api.isSliceStore) {
      module = {} as T;
      Object.entries(initialState).forEach(([key, value]) => {
        rawState[key] = key === 'name' ? value : {};
        (module as any)[key] =
          key === 'name' ? value : handle(rawState[key], value, key);
      });
    } else {
      module = handle(rawState, initialState);
    }
    // TODO: consider to remove this, about name property should be required.
    name = module.name ?? 'default';
    module.name = name;
    rootState = rawState;
    // in worker, the transport is the worker itself
    transport =
      options.transport ??
      (_workerType
        ? createTransport(_workerType, {
            prefix: module.name
          })
        : null);
    transport?.listen('execute', async (keys, args) => {
      console.log('execute', { keys, args });
      let base = api.getState();
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
    transport?.listen('fullSync', async () => {
      console.log('fullSync', rootState);
      return {
        state: JSON.stringify(rootState),
        sequence
      };
    });
    if (transport) {
      api.transport = transport;
    }
    return api;
  };
  const api = createApi({
    share: _workerType || options.transport ? 'main' : undefined
  });
  return Object.assign((option: AsyncStoreOption) => {
    if (!option) return api.getState();
    const _api = createApi({
      share: 'client'
    });
    // the transport is in the worker or shared worker, and the client is in the main thread.
    // This store can't be directly executed by any of the store's methods
    // its methods are proxied to the worker or share worker for execution.
    // and the executed patch is sent to the store to be applied to synchronize the state.
    const transport:
      | (Transport<{ listen: InternalEvents; emit: ExternalEvents }> & {
          /**
           * onConnect is called when the transport is connected.
           */
          onConnect?: (fn: () => void) => void;
        })
      | undefined = (option as WorkerOptions).worker
      ? createTransport(
          (option as WorkerOptions).worker instanceof SharedWorker
            ? 'SharedWorkerClient'
            : 'WorkerMain',
          {
            worker: (option as WorkerOptions).worker as SharedWorker,
            prefix: _api.getState().name
          }
        )
      : (option as TransportOptions).transport;
    if (!transport) {
      throw new Error('transport is required');
    }
    _api.transport = transport;
    let _sequence: number;
    const fullSync = async () => {
      console.log('fullSync');
      const latest = await transport.emit('fullSync');
      console.log('fullSync', latest);
      _api.apply(JSON.parse(latest.state) as T);
      _sequence = latest.sequence;
    };
    // TODO: implement to handle the case for the custom transport connects
    if (typeof transport.onConnect !== 'function') {
      throw new Error('transport.onConnect is required');
    }
    transport.onConnect?.(async () => {
      console.log('onConnect');
      await fullSync();
    });
    transport.listen('update', async ({ patches, sequence }) => {
      console.log('update', { patches, sequence });
      if (typeof sequence === 'number' && sequence === _sequence + 1) {
        _sequence = sequence;
        _api.apply(undefined, patches);
      } else {
        await fullSync();
      }
    });
    return Object.assign(() => _api.getState(), _api);
  }, api);
}

export { create };
