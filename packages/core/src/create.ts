import {
  create as createWithMutative,
  type Draft,
  apply,
  type Patches
} from 'mutative';
import { createTransport, type Transport } from 'data-transport';

export type ISlices = {
  /**
   * The name of the store.
   */
  name?: string;
} & Record<string, any>;

type Listener = () => void;

export interface Store<T extends ISlices> {
  /**
   * Set the next state.
   */
  setState: (
    /**
     * The next state.
     */
    next: T | ((draft: Draft<T>) => any) | null,
    /**
     * The updater is used to update the state.
     */
    updater?: () => void
  ) => void;
  /**
   * Get the current state.
   */
  getState: () => T;
  /**
   * Get the initial state.
   */
  getInitialState: () => T;
  /**
   * Subscribe to the state changes.
   */
  subscribe: (listener: Listener) => () => void;
  /**
   * Unsubscribe all listeners.
   */
  destroy: () => void;
  /**
   * apply the patches to the state.
   */
  apply: (state: T, patches?: Patches) => void;
  /**
   * The store is shared in the worker or shared worker.
   */
  share?: 'main' | 'client' | void;
  /**
   * The transport is used to communicate between the main thread and the worker or shared worker.
   */
  transport?: Transport;
  /**
   * The store is a slices.
   */
  isSlices: boolean;
}

type WorkerOptions = {
  /**
   * The worker is used to execute the function in the worker or shared worker.
   */
  worker?: Worker | SharedWorker;
  /**
   * The worker type is used to determine the type of worker.
   */
  workerType?: 'SharedWorkerInternal' | 'WorkerInternal';
};

type TransportOptions = {
  /**
   * The transport is used to communicate between the main thread and the worker or shared worker.
   */
  transport?: Transport;
};

type Option = WorkerOptions | TransportOptions;

type Internal = {
  /**
   * Update the state in the worker or shared worker.
   */
  update(options: {
    /**
     * The patches is used to update the state.
     */
    patches: Patches;
    /**
     * The sequence is used to ensure the sequence of the state.
     */
    sequence: number;
  }): Promise<void>;
};

type External = {
  /**
   * Execute the function in the worker or shared worker.
   */
  execute(keys: string[], args: any[]): Promise<any>;
  /**
   * Full sync the state with the worker or shared worker.
   */
  fullSync(): Promise<{ state: string; sequence: number }>;
};

const workerType = globalThis.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : globalThis.WorkerGlobalScope
    ? 'WorkerInternal'
    : null;

export type Slices<T extends ISlices> = (
  /**
   * The setState is used to update the state.
   */
  set: Store<T>['setState'],
  /**
   * The getState is used to get the state.
   */
  get: Store<T>['getState'],
  /**
   * The store is used to store the state.
   */
  store: Store<T>
) => T;

type Middlewares = any;

export const create = <T extends ISlices>(
  createState: Slices<T> | Record<string, Slices<T>>,
  options: {
    // TODO: remove this, it's only used in test
    transport?: Transport;
    // TODO: remove this, it's only used in test
    workerType?: 'SharedWorkerInternal' | 'WorkerInternal';
    middlewares?: Middlewares[];
  } = {}
) => {
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
    let transport: Transport<{ emit: Internal; listen: External }> | null =
      null;
    let sequence = 0;
    const listeners = new Set<Listener>();
    const setState: Store<T>['setState'] = (
      next,
      updater = () => {
        // TODO: implement mutable type state
        let nextState: T | null = null;
        let result: T | [T, Patches<true>, Patches<true>] | null = null;
        if (typeof next === 'function') {
          result = createWithMutative(
            rootState as T,
            (draft) => {
              rootState = draft;
              const returnValue = next(draft);
              if (returnValue instanceof Promise) {
                throw new Error(
                  'setState with async function is not supported'
                );
              }
            },
            {
              enablePatches: !!_workerType
            }
          );
          rootState = _workerType ? result[0] : result;
        } else {
          // only merge the state
          nextState = {
            ...(rootState as T),
            ...next
          };
          rootState = nextState!;
        }
        listeners.forEach((listener) => listener());
        return result;
      }
    ) => {
      const result = updater();
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
      setState,
      getState,
      getInitialState,
      subscribe,
      destroy,
      apply: (state = rootState, patches) => {
        rootState = patches ? apply(state, patches) : state;
        listeners.forEach((listener) => listener());
      },
      isSlices: typeof createState === 'object'
    };
    // in worker, the transport is the worker itself
    transport =
      options.transport ??
      (_workerType ? createTransport(_workerType, {}) : null);
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
    api.share = transport ? 'main' : share;
    const initialState = api.isSlices
      ? Object.entries(createState).reduce(
          (stateTree, [key, _createState]) => {
            stateTree[key] = _createState(setState, getState, api);
            return stateTree;
          },
          {} as Record<string, Slices<T>>
        )
      : (createState as Slices<T>)(api.setState, api.getState, api);

    const rawState = {} as any;
    const handle = (_rawState: any, _initialState: any, _key?: string) => {
      const descriptors = Object.getOwnPropertyDescriptors(_initialState);
      Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          if (typeof descriptor.value !== 'function') {
            _rawState[key] = descriptor.value;
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
          }
        }
      });
      // TODO: improve perf
      // it should be a immutable state
      const slice = Object.defineProperties({} as T, descriptors);
      return slice;
    };
    if (api.isSlices) {
      module = {} as T;
      Object.entries(initialState).forEach(([key, value]) => {
        rawState[key] = {};
        // @ts-ignore
        module[key] =
          key === 'name' ? value : handle(rawState[key], value, key);
      });
    } else {
      module = handle(rawState, initialState);
    }
    // TODO: consider to remove this, about name property should be required.
    name = module.name ?? 'default';
    if (transport) {
      api.transport = transport;
    }
    rootState = rawState;
    return api;
  };
  const api = createApi();
  return Object.assign((option: Option) => {
    if (!option) return api.getState();
    // the transport is in the worker or shared worker, and the client is in the main thread.
    // This store can't be directly executed by any of the store's methods
    // its methods are proxied to the worker or share worker for execution.
    // and the executed patch is sent to the store to be applied to synchronize the state.
    const transport:
      | (Transport<{ listen: Internal; emit: External }> & {
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
            worker: (option as WorkerOptions).worker as SharedWorker
          }
        )
      : (option as TransportOptions).transport;
    if (!transport) {
      throw new Error('transport is required');
    }
    const _api = createApi({
      share: 'client'
    });
    _api.transport = transport;
    let _sequence: number;
    const fullSync = async () => {
      console.log('fullSync');
      const latest = await transport.emit('fullSync');
      console.log('fullSync', latest, _api.getState().name);
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
};
