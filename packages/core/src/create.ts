import {
  create as createWithMutative,
  type Draft,
  apply,
  type Patches
} from 'mutative';
import { createTransport, type Transport } from 'data-transport';

// TODO: check the name
// export type ISlices = { name: string } & Record<string, any>;

type ISlices = object;

type Listener<T> = (state: T, previousState: T) => void;

export interface Store<T extends ISlices> {
  /**
   * Set the next state.
   */
  setState(next: T | ((draft: Draft<T>) => void)): void;
  /**
   * Get the current state.
   */
  getState(): T;
  /**
   * Get the initial state.
   */
  getInitialState(): T;
  /**
   * Subscribe to the state changes.
   */
  subscribe(listener: Listener<T>): () => void;
  /**
   * Unsubscribe all listeners.
   */
  destroy(): void;
  /**
   * The store is shared in the worker or shared worker.
   */
  share?: 'main' | 'client' | void;
  /**
   * The transport is used to communicate between the main thread and the worker or shared worker.
   */
  transport?: Transport;
}

type Option = {
  worker?: Worker | SharedWorker;
  transport?: Transport;
};

type Internal = {
  update(options: {
    name: string;
    patches: Patches;
    sequence: number;
  }): Promise<void>;
};

type External = {
  execute(key: string, args: any[]): Promise<any>;
  fullSync(): Promise<{ state: string; sequence: number }>;
};

// TODO: fix this
// @ts-ignore
const workerType = globalThis.SharedWorkerGlobalScope
  ? 'SharedWorkerInternal'
  : // @ts-ignore
    globalThis.WorkerGlobalScope
    ? 'WorkerInternal'
    : null;

type Slices<T extends ISlices> = (
  set: Store<T>['setState'],
  get: Store<T>['getState'],
  store: Store<T>
) => T;

export const create = <T extends ISlices>(
  createState: Slices<T> | Record<string, Slices<T>>,
  options?: {
    name: string;
    transport?: Transport;
    middlewares: any[];
  }
) => {
  let state: T;
  const createApi = ({ share }: { share?: 'client' | 'main' } = {}) => {
    let transport: Transport<{ emit: Internal; listen: External }> | null =
      null;
    let sequence = 0;
    const listeners = new Set<Listener<T>>();
    const setState: Store<T>['setState'] = (
      next,
      result?: T | [T, Patches<true>, Patches<true>]
    ) => {
      let nextState: T | null = null;
      if (typeof next === 'function') {
        result = createWithMutative(state, (draft) => next(draft), {
          enablePatches: !!workerType
        });
        // @ts-ignore
        nextState = workerType ? result[0] : result;
      } else {
        // TODO: deep merge and fix performance issue
        nextState = Object.assign({}, state, next);
      }
      if (api.subscribe === subscribe && !Object.is(nextState, state)) {
        const previousState = state;
        state = nextState!;
        listeners.forEach((listener) => listener(state, previousState));
      }
      if (transport) {
        sequence += 1;
        transport.emit('update', {
          // @ts-ignore
          patches: result![1],
          // @ts-ignore
          name: state.name,
          sequence
        });
      }
    };
    const getState = () => state;
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
    const api: Store<any> = {
      setState,
      getState,
      getInitialState,
      subscribe,
      destroy
    };
    // in worker, the transport is the worker itself
    transport =
      options?.transport ??
      (workerType
        ? createTransport(workerType, {
            // TODO: fix prefix
            // @ts-ignore
            // prefix: state!.name
          })
        : null);
    transport?.listen('execute', async (key, args) => {
      console.log('execute', { key, args });
      // @ts-ignore
      return api.getState()[key](...args);
    });
    transport?.listen('fullSync', async () => {
      console.log('fullSync');
      return {
        state: JSON.stringify(state),
        sequence
      };
    });
    api.share = transport ? 'main' : share;
    const initialState = (state =
      typeof createState === 'object'
        ? Object.entries(createState).reduce(
            (stateTree, [key, _createState]) => {
              // !!! createState is a function
              stateTree[key] = _createState(setState, getState, api);
              return stateTree;
            },
            {} as any
          )
        : // !!! createState is a function
          createState(api.setState, api.getState, api)) as any;

    if (workerType) {
      initialState.name = workerType
        ? // @ts-ignore
          globalThis.name
          ? // @ts-ignore
            globalThis.name
          : workerType
        : '';
    }
    if (transport) {
      // @ts-ignore
      api.transport = transport;
    }
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
      | Transport<{ listen: Internal; emit: External }>
      | undefined = option.worker
      ? createTransport(
          option.worker instanceof SharedWorker
            ? 'SharedWorkerClient'
            : 'WorkerMain',
          {
            // TODO: fix prefix
            // @ts-ignore
            // prefix: state.name,
            worker: option.worker as SharedWorker
          }
        )
      : option.transport;
    if (!transport) {
      throw new Error('transport is required');
    }
    const _api = createApi({ share: 'client' });
    _api.transport = transport;
    const _state = _api.getState();
    for (const key in _state) {
      const value = _state[key];
      if (typeof value === 'function') {
        // @ts-ignore
        _state[key] = (...args: any[]) => {
          console.log('execute', { key, args });
          return transport.emit('execute', key, args);
        };
      }
    }
    let _sequence: number;
    const fullSync = async () => {
      console.log('fullSync');
      const latest = await transport.emit('fullSync');
      console.log('fullSync', latest);
      _api.setState(JSON.parse(latest.state) as T);
      _sequence = latest.sequence;
    };
    // TODO: implement to handle the case for the custom transport connects
    // @ts-ignore
    transport.onConnect?.(async () => {
      await fullSync();
    });
    transport.listen('update', async ({ patches, name, sequence }) => {
      console.log('update', { patches, name, sequence });
      // TODO: fix this
      // @ts-ignore
      // if (name !== state.name) return;
      if (typeof sequence === 'number' && sequence === _sequence + 1) {
        _sequence = sequence;
        if (_api.apply) {
          _api.apply(_api.getState(), patches);
        } else {
          // @ts-ignore
          const next = apply(_api.getState(), patches);
          _api.setState(next ?? _api.getState());
        }
      } else {
        await fullSync();
      }
    });
    return Object.assign(() => _api.getState(), _api);
  }, api);
};
