import {
  create as createWithMutative,
  type Draft,
  apply,
  type Patches
} from 'mutative';
import { createTransport, type Transport } from 'data-transport';

export type Slices = { name: string } & Record<string, any>;

type Listener<T> = (state: T, previousState: T) => void;

export interface Store<T extends Slices> {
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
}

type Option = {
  worker?: Worker | SharedWorker;
  transport?: Transport;
};

type Internal = {
  update(options: { name: string; patches: Patches }): Promise<void>;
};

// TODO: fix this
// @ts-ignore
const workerType = globalThis.WorkerGlobalScope
  ? 'WorkerInternal'
  : // @ts-ignore
    globalThis.SharedWorkerGlobalScope
    ? 'SharedWorkerInternal'
    : null;

export const create = <T extends Slices>(
  createState: (set: Store<T>['setState'], store: Store<T>) => T
) => {
  // in worker, the transport is the worker itself
  const transport: Transport<{ emit: Internal }> | null = workerType
    ? createTransport(workerType, {})
    : null;
  let state: T;
  const createApi = () => {
    const listeners = new Set<Listener<T>>();
    const setState: Store<T>['setState'] = (next) => {
      let nextState: T | null = null;
      let result: T | [T, Patches<true>, Patches<true>] | null = null;
      if (typeof next === 'function') {
        result = createWithMutative(state, (draft) => next(draft), {
          enablePatches: !!workerType
        });
        nextState = workerType ? result[0] : result;
      } else {
        nextState = next;
      }
      if (!Object.is(nextState, state)) {
        const previousState = state;
        state = nextState!;
        listeners.forEach((listener) => listener(state, previousState));
      }
      transport?.emit('update', { patches: result![1], name: state.name });
    };
    const getState = () => state;
    const getInitialState = () => initialState;
    const subscribe: Store<T>['subscribe'] = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const destroy = () => {
      listeners.clear();
      transport?.dispose();
    };
    const api = { setState, getState, getInitialState, subscribe, destroy };
    const initialState = (state = createState(api.setState, api));
    return api;
  };
  const api = createApi();
  return Object.assign((option: Option) => {
    if (!option) return api.getState();
    const transport: Transport<{ listen: Internal }> | undefined = option.worker
      ? createTransport(
          option.worker instanceof SharedWorker
            ? 'SharedWorkerClient'
            : 'WorkerMain',
          {
            prefix: state.name,
            worker: option.worker as SharedWorker
          }
        )
      : option.transport;
    if (!transport) {
      throw new Error('transport is required');
    }
    const _api = createApi();
    transport.listen('update', async ({ patches, name }) => {
      if (name !== state.name) return;
      const next = apply(_api.getState(), patches);
      _api.setState(next);
    });
    return Object.assign(() => _api.getState(), _api);
  }, api);
};
