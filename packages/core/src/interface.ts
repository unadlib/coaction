import type { Transport } from 'data-transport';
import type { Draft } from './draft';
import type { Patches } from './patch';
import type { JsonValue } from './jsonTypes';

/**
 * Generic object shape used by stores and slices.
 */
export type ISlices<T = any> = Record<PropertyKey, T>;

/**
 * Recursive partial object accepted by {@link Store.setState} when merging a
 * plain object payload into the current state tree.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Subscription callback invoked after the store publishes a state change.
 */
export type Listener = () => void;

/**
 * Patch pair exposed to middleware compatibility hooks.
 */
export interface PatchTransform {
  patches: Patches;
  inversePatches: Patches;
}

/**
 * Trace envelope emitted before and after a store method executes.
 */
export interface StoreTraceEvent {
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
  sliceKey?: PropertyKey;
  /**
   * The parameters of the method.
   */
  parameters?: any[];
  /**
   * The result of the method.
   */
  result?: any;
}

/**
 * Runtime store contract returned by {@link create} before framework-specific
 * wrappers add selectors or reactivity helpers.
 *
 * @remarks
 * `getState()` returns methods and getters alongside plain data. Methods
 * extracted from the returned object keep the correct `this` binding when they
 * are later invoked.
 */
export interface Store<T extends ISlices = ISlices> {
  /**
   * The name of the store.
   */
  name: string;
  /**
   * Mutate the current state.
   *
   * @remarks
   * Pass a deep-partial object to merge fields, or pass an updater to edit a
   * draft. Passing `null` is a no-op. Client-side shared stores intentionally reject direct
   * `setState()` calls; trigger a store method instead.
   */
  setState: (
    /**
     * The next partial state, or an updater that mutates a draft.
     */
    next: DeepPartial<T> | ((draft: Draft<T>) => any) | null,
    /**
     * Low-level updater hook used by transports and middleware integrations.
     */
    updater?: (
      next: DeepPartial<T> | ((draft: Draft<T>) => any) | null
    ) => [] | [T, Patches, Patches]
  ) => void;
  /**
   * Read the current state object.
   *
   * @remarks
   * The returned object includes methods and getters. Methods destructured from
   * this object continue to execute against the latest store state.
   */
  getState: () => T;
  /**
   * Subscribe to state changes.
   *
   * @returns A function that removes the listener.
   */
  subscribe: (listener: Listener) => () => void;
  /**
   * Tear down the store.
   *
   * @remarks
   * `destroy()` is idempotent. It clears subscriptions and disposes any
   * attached transport.
   */
  destroy: () => void;
  /**
   * Indicates whether the store is local, the main shared store, or a client
   * mirror of a shared store.
   */
  share?: 'main' | 'client' | false;
  /**
   * Transport used to synchronize a shared store between processes or threads.
   */
  transport?: Transport;
  /**
   * Whether `createState` was interpreted as a slices object.
   */
  isSliceStore: boolean;
  /**
   * Apply patches to the current state.
   *
   * @remarks
   * This is a low-level hook used by transports and middleware. Application
   * code should generally prefer store methods or `setState()`. Client-side
   * shared-store mirrors reject direct `apply()` calls.
   */
  apply: (state?: T, patches?: Patches) => void;
  /**
   * Return the current state without methods or getters.
   *
   * @remarks
   * Useful for serialization, inspection, or tests that only care about raw
   * data.
   */
  getPureState: () => T;
  /**
   * Return the state produced during initialization before later mutations.
   */
  getInitialState: () => T;
  /**
   * @deprecated Middleware compatibility hook. Prefer typing middleware stores
   * with `MiddlewareStore`.
   */
  patch?: (option: PatchTransform) => PatchTransform;
  /**
   * @deprecated Middleware compatibility hook. Prefer typing middleware stores
   * with `MiddlewareStore`.
   */
  trace?: (options: StoreTraceEvent) => void;
}

/**
 * Semantic alias for middleware-facing stores.
 *
 * @remarks
 * Middleware implementations should type their `store` parameter as
 * `MiddlewareStore` instead of relying on deprecated `patch` or `trace` hooks.
 */
export interface MiddlewareStore<
  T extends ISlices = ISlices
> extends Store<T> {}

export type InternalEvents = {
  /**
   * Update the state in the worker or shared worker.
   */
  update(message: string): Promise<void>;
};

export type ExternalEvents = {
  /**
   * Execute the function in the worker or shared worker.
   */
  execute(message: string): Promise<string>;
  /**
   * Full sync the state with the worker or shared worker.
   */
  fullSync(message: string): Promise<string>;
};

export type TransportPolicyRequest =
  | {
      action: readonly string[];
      args: readonly JsonValue[];
      type: 'execute';
    }
  | { type: 'fullSync' };

export type TransportPolicy = {
  /** Further restrict action paths declared by the authoritative store. */
  allowedActions?: readonly (readonly string[])[];
  /** Authorize a decoded JSON request before serving it. */
  authorize?: (request: TransportPolicyRequest) => boolean | Promise<boolean>;
  /**
   * Map a caught execute error to an explicitly client-visible message.
   * Returning `undefined` keeps the generic redacted message.
   */
  mapError?: (
    error: unknown,
    request: TransportPolicyRequest
  ) => string | undefined | Promise<string | undefined>;
};

/**
 * Helper passed into {@link Slice} and {@link Slices} factories.
 *
 * @remarks
 * Call it with no arguments to read the current store state. Call it with a
 * dependency selector pair to define a computed value.
 */
export interface Getter<T extends ISlices> {
  <P extends any[], R>(
    getDeps: (store: T) => readonly [...P] | [...P],
    selector: (...args: P) => R
  ): R;
  (): T;
}

/**
 * Factory for a single store object.
 *
 * @remarks
 * Return a plain object containing state, getters, and methods. Methods and
 * getters may use `this` to access the live store state.
 */
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

/**
 * Factory for a named slice inside a slices store.
 *
 * @remarks
 * The returned object becomes the value stored under the slice key. When an
 * object input only contains functions, prefer explicit `sliceMode` to avoid
 * ambiguity between slices and a plain method-only store.
 */
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

/**
 * Store enhancer invoked during store creation.
 *
 * @remarks
 * Middleware may mutate the received store in place or return a replacement
 * store object, but it must preserve the {@link Store} contract.
 */
export type Middleware<T extends CreateState> = (
  store: MiddlewareStore<T>
) => MiddlewareStore<T>;

/**
 * Derived state object produced by mapping slice factories to their return
 * types.
 */
export type SliceState<T extends Record<PropertyKey, Slice<any>>> = {
  [K in keyof T]: ReturnType<T[K]>;
};

/**
 * Options for creating a local store or the main side of a shared store.
 */
export type StoreOptions<T extends CreateState> = {
  /**
   * The name of the store.
   */
  name?: string;
  /**
   * @deprecated Internal worker-mode override retained for compatibility.
   * Prefer passing `transport` or letting the runtime infer the environment.
   */
  workerType?: 'SharedWorkerInternal' | 'WebWorkerInternal';
  /**
   * Inject a pre-built transport for advanced shared-store setups.
   */
  transport?: Transport;
  /** Restrict requests accepted by a shared-main store. */
  transportPolicy?: TransportPolicy;
  /**
   * Middleware chain applied before the initial state is finalized.
   */
  middlewares?: Middleware<T>[];
  /**
   * Enable patch generation.
   *
   * @remarks
   * Required for async client stores and useful for middleware or mutable
   * integrations that depend on patch streams.
   */
  enablePatches?: boolean;
  /**
   * Control how `createState` should be interpreted.
   *
   * @remarks
   * - auto: infer from createState shape. Object maps whose values are all
   *   functions are ambiguous, so prefer setting `sliceMode` explicitly.
   * - slices: force slices mode.
   * - single: force single-store mode.
   */
  sliceMode?: 'auto' | 'slices' | 'single';
  /** @internal Client transport sources are only accepted by client overloads. */
  clientTransport?: never;
  /** @internal Client execution timeouts are only accepted by client overloads. */
  executeSyncTimeoutMs?: never;
  /** @internal Worker instances are only accepted by client overloads. */
  worker?: never;
};

/** Options accepted by the statically isolated local-store entry point. */
export type LocalStoreOptions<T extends CreateState> = Omit<
  StoreOptions<T>,
  | 'clientTransport'
  | 'executeSyncTimeoutMs'
  | 'transport'
  | 'transportPolicy'
  | 'worker'
  | 'workerType'
>;

/**
 * Options for creating a client mirror of a shared store.
 *
 * @remarks
 * Methods on the returned store become promise-returning methods because
 * execution happens on the main/shared store.
 *
 * Passing an explicit `worker` or `clientTransport` key whose value is
 * `undefined` degrades to a strict local authority. Its `getState()` actions
 * remain promise-returning and its state, arguments, and results obey the
 * shared JSON contract. It is not a client mirror: tabs remain independent
 * and low-level local-authority mutations stay available.
 */
export type ClientStoreOptions<T extends CreateState> = {
  /**
   * The name of the shared store to connect to.
   */
  name?: string;
  /**
   * Middleware chain applied to the client-side store wrapper.
   */
  middlewares?: Middleware<T>[];
  /**
   * Control how `createState` should be interpreted.
   *
   * @remarks
   * - auto: infer from createState shape. Object maps whose values are all
   *   functions are ambiguous, so prefer setting `sliceMode` explicitly.
   * - slices: force slices mode.
   * - single: force single-store mode.
   */
  sliceMode?: 'auto' | 'slices' | 'single';
} & ClientTransportOptions;

/**
 * Transport-related options for client/shared-store mirrors.
 */
export type ClientTransportOptions = {
  /**
   * @deprecated Internal worker-mode override retained for compatibility.
   * Prefer passing `clientTransport` or `worker`.
   */
  workerType?: 'WebWorkerClient' | 'SharedWorkerClient';
  /**
   * How long the client should wait for sequence catch-up before falling back
   * to `fullSync`.
   *
   * Increase this when worker-side execution can complete before the matching
   * incremental `update` message arrives under heavy load.
   *
   * @default 1500
   */
  executeSyncTimeoutMs?: number;
  /**
   * Inject a pre-built client transport.
   */
  clientTransport?: Transport<any>;
  /**
   * Build a client transport from a Worker or SharedWorker instance.
   *
   * @remarks
   * `undefined` is accepted when the application explicitly chooses the local
   * fallback. `getState()` actions still return promises and the shared JSON
   * contract remains enforced, but the fallback owns independent local state.
   * Worker-constructor and transport-setup failures are not silently degraded.
   */
  worker?: SharedWorker | Worker;
} & (
  | {
      clientTransport: Transport<any> | undefined;
    }
  | {
      worker: SharedWorker | Worker | undefined;
    }
  | {
      workerType: 'WebWorkerClient' | 'SharedWorkerClient';
    }
);

/**
 * Transform store methods into promise-returning methods for client stores.
 */
export type Asyncify<T extends object, D extends true | false> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>>
    : D extends false
      ? T[K]
      : {
          [P in keyof T[K]]: T[K][P] extends (...args: any[]) => any
            ? (
                ...args: Parameters<T[K][P]>
              ) => Promise<Awaited<ReturnType<T[K][P]>>>
            : T[K][P];
        };
};

/**
 * Store shape returned by {@link create} when acting as a client of a shared
 * store.
 *
 * @remarks
 * Methods return promises because they execute on the main/shared store.
 */
export type StoreWithAsyncFunction<
  T extends object,
  D extends true | false = false
> = Omit<Store<Asyncify<T, D>>, 'getInitialState'> & {
  /** Return the original synchronous state shape produced at initialization. */
  getInitialState: () => T;
} & (() => Asyncify<T, D>);

/**
 * Callable store returned by {@link create} in local or main/shared mode.
 */
export type StoreReturn<T extends object> = Store<T> & ((...args: any[]) => T);

/**
 * Accepted `create()` input shape.
 *
 * @remarks
 * This can be either a single store factory/object or a map of slice
 * factories.
 */
export type CreateState = ISlices | Record<PropertyKey, Slice<any>>;

type SingleStoreOptions<T extends CreateState> = StoreOptions<T> & {
  sliceMode: 'single';
};

type SingleLocalStoreOptions<T extends CreateState> = LocalStoreOptions<T> & {
  sliceMode: 'single';
};

type SingleClientStoreOptions<T extends CreateState> = ClientStoreOptions<T> & {
  sliceMode: 'single';
};

/**
 * Overload set for {@link create}.
 *
 * @remarks
 * - `Slice` + `StoreOptions` returns a synchronous local or main/shared store.
 * - slice map + `StoreOptions` returns a synchronous slices store.
 * - `Slice` + `ClientStoreOptions` returns an async client store.
 * - slice map + `ClientStoreOptions` returns an async client slices store.
 *
 * Explicit client source keys with an `undefined` value degrade to a strict
 * local authority that keeps the async `getState()` action contract.
 *
 * For object inputs whose enumerable values are all functions, prefer explicit
 * `sliceMode` to avoid ambiguous inference.
 */
export type Creator = {
  <T extends ISlices>(
    createState: T,
    options: SingleClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<SliceState<T>, true>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options: ClientStoreOptions<T>
  ): StoreWithAsyncFunction<T>;
  <T extends ISlices>(
    createState: T,
    options: SingleStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: StoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: StoreOptions<T>
  ): StoreReturn<T>;
};

/** Overload set for the transport-free `coaction` create function. */
export type LocalCreator = {
  <T extends ISlices>(
    createState: T,
    options: SingleLocalStoreOptions<T>
  ): StoreReturn<T>;
  <T extends Record<PropertyKey, Slice<any>>>(
    createState: T,
    options?: LocalStoreOptions<T>
  ): StoreReturn<SliceState<T>>;
  <T extends ISlices>(
    createState: Slice<T> | T,
    options?: LocalStoreOptions<T>
  ): StoreReturn<T>;
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
