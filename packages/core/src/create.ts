import {
  type Draft,
  create as createWithMutative,
  apply,
  isDraft
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

export const createBinder = ({
  handleState,
  handleStore
}: {
  handleState: any;
  handleStore: any;
}) => {
  return (options: any) => {
    const { copyState, key, bind } = handleState(options);
    const value = key ? copyState[key] : copyState;
    value[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  };
};

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
  const _workerType = options.workerType ?? workerType;
  const createApi = ({
    share
  }: {
    share?: 'client' | 'main';
  } = {}) => {
    let module: T;
    let rootState: T | Draft<T>;
    let api: Store<any>;
    let name: string;
    let transport: Transport<{
      emit: InternalEvents;
      listen: ExternalEvents;
    }> | null = null;
    let sequence = 0;
    const listeners = new Set<Listener>();
    const setState: Store<T>['setState'] = (
      next,
      updater = (next) => {
        const merge = (_next = next) => {
          if (api.isSliceStore) {
            if (typeof _next === 'object' && _next !== null) {
              for (const key in _next) {
                if (
                  typeof _next[key as keyof typeof _next] === 'object' &&
                  _next[key as keyof typeof _next] !== null
                ) {
                  Object.assign(
                    // @ts-ignore
                    rootState[key],
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
          // best performance by default for immutable state
          rootState = createWithMutative(rootState, () => {
            return fn.apply(null);
          });
          listeners.forEach((listener) => listener());
          return [];
        }
        let backupState = rootState;
        const [, patches, inversePatches] = createWithMutative(
          rootState,
          (draft: any) => {
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
        api.apply(rootState, finalPatches.patches);
        api.setState(null, () => [
          null,
          finalPatches.patches,
          finalPatches.inversePatches
        ]);
        listeners.forEach((listener) => listener());
        return [rootState, patches, inversePatches];
      }
    ) => {
      const result = updater(next);
      if (transport) {
        sequence += 1;
        transport.emit('update', {
          patches: result![1],
          sequence
        });
      }
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
      const mutableInstance = api.toRaw?.(_initialState);
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
            if (key !== 'name') {
              delete descriptor.value;
              delete descriptor.writable;
              descriptor.get = () =>
                _key ? (rootState as any)[_key][key] : (rootState as any)[key];
              descriptor.set = (value: any) => {
                if (_key) {
                  (rootState as any)[_key][key] = value;
                } else {
                  (rootState as any)[key] = value;
                }
              };
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
              if (mutableInstance) {
                let result: any;
                if (isDraft(rootState)) {
                  result = fn.apply(
                    _key ? api.getState()[_key] : api.getState(),
                    args
                  );
                  return result;
                }
                let backupState = rootState;
                const [draft, finalize] = createWithMutative(rootState, {
                  // mark: () => 'immutable',
                  enablePatches: true
                });
                rootState = draft as any;
                result = fn.apply(
                  _key ? api.getState()[_key] : api.getState(),
                  args
                );
                const handleResult = () => {
                  rootState = backupState;
                  const [, patches, inversePatches] = finalize();
                  const finalPatches = api.patch
                    ? api.patch({ patches, inversePatches })
                    : { patches, inversePatches };
                  api.apply(rootState, finalPatches.patches);
                  api.setState(null, () => [
                    null,
                    finalPatches.patches,
                    finalPatches.inversePatches
                  ]);
                };
                if (result instanceof Promise) {
                  if (process.env.NODE_ENV === 'development') {
                    console.warn(
                      'It will be combined with the next state in the async function.'
                    );
                  }
                  return result.finally(handleResult);
                }
                handleResult();
                return result;
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
        // @ts-ignore
        module[key] =
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
