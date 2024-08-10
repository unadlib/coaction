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
  setState(next: T | ((draft: Draft<T>) => void)): void;
  getState(): T;
  getInitialState(): T;
  subscribe(listener: Listener<T>): () => void;
  destroy(): void;
}

type Option = {
  worker?: Worker | SharedWorker;
  transport?: Transport;
};

type Internal = {
  update(options: { name: string; patches: Patches }): Promise<void>;
};

// @ts-ignore
const workerType = globalThis.WorkerGlobalScope
  ? 'WorkerInternal'
  : // @ts-ignore
    globalThis.SharedWorkerGlobalScope
    ? 'SharedWorkerInternal'
    : null;

export const create = <T extends Slices>(
  createState: (store: Store<T>) => T
) => {
  const transport: Transport<{ emit: Internal }> | null = workerType
    ? createTransport(workerType, {})
    : null;
  let state: T;
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
  };
  const api = { setState, getState, getInitialState, subscribe, destroy };
  const initialState = (state = createState(api));
  return Object.assign((option: Option) => {
    const transport: Transport<{ listen: Internal }> = option.worker
      ? createTransport(
          option.worker instanceof SharedWorker
            ? 'SharedWorkerClient'
            : 'WorkerMain',
          {
            prefix: state.name,
            worker: option.worker as SharedWorker
          }
        )
      : option.transport!;
    transport!.listen('update', async ({ patches, name }) => {
      if (name !== state.name) return;
      const next = apply(api.getState(), patches);
      setState(next);
    });
  }, api);
};
