import type { Transport } from 'data-transport';
import type { Draft, Patches } from 'mutative';

export type ISlices<T = any> = Record<string, T>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type Listener = () => void;

export interface Store<T extends ISlices = ISlices> {
  /**
   * The name of the store.
   */
  name: string;
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
   * The store is shared in the web worker, shared worker, or other process.
   */
  share?: 'main' | 'client' | false;
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
  apply: (state?: T, patches?: Patches) => void;
  /**
   * the pure state is used to get the state without the methods and getters.
   */
  getPureState: () => T;
  /**
   * Get the initial state.
   */
  getInitialState: () => T;
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
    /**
     * The id of the method.
     */
    id: string;
    /**
     * The method name.
     */
    method: string;
    /**
     * The slice key.
     */
    sliceKey?: string;
    /**
     * The parameters of the method.
     */
    parameters?: any[];
    /**
     * The result of the method.
     */
    result?: any;
  }) => void;
}

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

export type Middleware<T extends CreateState> = (store: Store<T>) => Store<T>;

export type SliceState<T extends Record<string, Slice<any>>> = {
  [K in keyof T]: ReturnType<T[K]>;
};

export type StoreOptions<T extends CreateState> = {
  /**
   * The name of the store.
   */
  name?: string;
  // TODO: remove this, it's only used in test
  transport?: Transport;
  // TODO: remove this, it's only used in test
  workerType?: 'SharedWorkerInternal' | 'WebWorkerInternal';
  middlewares?: Middleware<T>[];
  /**
   * enable patches
   */
  enablePatches?: boolean;
};

export type ClientStoreOptions<T extends CreateState> = {
  /**
   * The name of the store.
   */
  name?: string;
  middlewares?: Middleware<T>[];
} & ClientTransportOptions;

export interface ClientTransportOptions {
  workerType?: 'WebWorkerClient' | 'SharedWorkerClient';
  clientTransport?: Transport<any>;
  worker?: SharedWorker | Worker;
}

export type Asyncify<T extends object, D extends true | false> = {
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

export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Store<Asyncify<T, D>> & (() => Asyncify<T, D>);

export type StoreReturn<T extends object> = Store<T> & ((...args: any[]) => T);

export type CreateState = ISlices | Record<string, Slice<any>>;

export type Creator = {
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<string, Slice<any>>>(
    createState: T,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T>,
    options?: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
};

export type ClientTransport =
  | (Transport<{ listen: InternalEvents; emit: ExternalEvents }> & {
      /**
       * onConnect is called when the transport is connected.
       */
      onConnect?: (fn: () => void) => void;
    })
  | undefined;

export type StoreTransport =
  | (Transport<{ listen: ExternalEvents; emit: InternalEvents }> & {
      /**
       * onConnect is called when the transport is connected.
       */
      onConnect?: (fn: () => void) => void;
    })
  | undefined;
