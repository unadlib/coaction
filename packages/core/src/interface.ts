import type { Transport } from 'data-transport';
import type { Draft, Patches } from 'mutative';

export type ISlices<T = any> = Record<string, T>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type Listener = () => void;

export interface Store<T extends ISlices> {
  /**
   * The id of the store.
   */
  id: string;
  /**
   * Set the next state.
   */
  setState: (
    /**
     * The next state.
     */
    next: DeepPartial<T> | ((draft: Draft<T>) => any) | null,
    /**
     * The updater is used to update the state.
     */
    updater?: (
      next: DeepPartial<T> | ((draft: Draft<T>) => any) | null
    ) => [] | [T, Patches, Patches]
  ) => void;
  /**
   * Get the current state.
   */
  getState: () => T;
  /**
   * Subscribe to the state changes.
   */
  subscribe: (listener: Listener) => () => void;
  /**
   * Unsubscribe all listeners and dispose the transport.
   */
  destroy: () => void;
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
  isSliceStore: boolean;
  /**
   * apply the patches to the state.
   */
  apply: (state: T, patches?: Patches) => void;
  /**
   * Get the raw instance via the initial state.
   */
  toRaw?: (key: any) => any;
  /**
   * The patch is used to update the state.
   */
  patch?: (option: { patches: Patches; inversePatches: Patches }) => {
    patches: Patches;
    inversePatches: Patches;
  };
  /**
   * The act is used to run the function in the action.
   */
  act?: <T extends () => any>(fn: T) => ReturnType<T>;
  /**
   * The trace is used to trace the action
   */
  trace?: (options: {
    id: string;
    method: string;
    parameters?: any[];
    result?: any;
  }) => void;
}

export type WorkerOptions = {
  /**
   * The worker is used to execute the function in the worker or shared worker.
   */
  worker?: Worker | SharedWorker;
  /**
   * The worker type is used to determine the type of worker.
   */
  workerType?: 'SharedWorkerInternal' | 'WorkerInternal';
};

export type TransportOptions = {
  /**
   * The transport is used to communicate between the main thread and the worker or shared worker.
   */
  transport?: Transport;
};

export type AsyncStoreOption = WorkerOptions | TransportOptions;

export type InternalEvents = {
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

export type ExternalEvents = {
  /**
   * Execute the function in the worker or shared worker.
   */
  execute(keys: string[], args: any[]): Promise<any>;
  /**
   * Full sync the state with the worker or shared worker.
   */
  fullSync(): Promise<{ state: string; sequence: number }>;
};

interface Getter<T extends ISlices> {
  <P extends any[], R>(
    getDeps: (store: T) => readonly [...P] | [...P],
    selector: (...args: P) => R
  ): R;
  (): T;
}

export type Slice<T extends ISlices> = (
  /**
   * The setState is used to update the state.
   */
  set: Store<T>['setState'],
  /**
   * The getState is used to get the state.
   */
  get: Getter<T>,
  /**
   * The store is used to store the state.
   */
  store: Store<T>
) => T;

export type Slices<T extends ISlices, K extends keyof T> = (
  /**
   * The setState is used to update the state.
   */
  set: Store<T>['setState'],
  /**
   * The getState is used to get the state.
   */
  get: Getter<T>,
  /**
   * The store is used to store the state.
   */
  store: Store<T>
) => T[K];

export type Middleware = (store: Store<any>) => Store<any>;

export type SliceState<T extends Record<string, Slice<any>>> = {
  [K in keyof T]: ReturnType<T[K]>;
};

export type StoreOptions = {
  /**
   * The id of the store.
   */
  id?: string;
  // TODO: remove this, it's only used in test
  transport?: Transport;
  // TODO: remove this, it's only used in test
  workerType?: 'SharedWorkerInternal' | 'WorkerInternal';
  middlewares?: Middleware[];
  /**
   * enable patches
   */
  enablePatches?: boolean;
};

type WorkerStoreOptions = {
  workerType?: 'WorkerMain';
  transport?: Transport<any>;
  worker?: SharedWorker | Worker;
};

type Asyncify<T extends object, D extends true | false> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>
    : D extends false
      ? T[K]
      : {
          [P in keyof T[K]]: T[K][P] extends (...args: any[]) => any
            ? (...args: Parameters<T[K][P]>) => Promise<ReturnType<T[K][P]>>
            : T[K][P];
        };
};

type StoreWithAsyncFunction<T extends object, D extends true | false> = Store<
  Asyncify<T, D>
> &
  (() => Asyncify<T, D>);

export type StoreReturn<
  T extends object,
  D extends true | false = false
> = Store<T> &
  (<O extends [WorkerStoreOptions] | []>(
    ...args: O
  ) => O extends [any, ...any[]] ? StoreWithAsyncFunction<T, D> : T);
