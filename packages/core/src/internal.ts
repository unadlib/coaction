import type { Draft, Patches } from 'mutative';
import type { CreateState, Listener } from './interface';
import type { ReactivePathNode } from './reactivePath';

export type MutationOperation = 'setState' | 'apply';

export type StoreOperation =
  | MutationOperation
  | 'subscribe'
  | 'store initialization'
  | `action ${string}`;

export type StateSchema = {
  rootKeys: Set<PropertyKey>;
  sliceKeys?: Map<PropertyKey, Set<PropertyKey>>;
};

/** One invocation of an action on a mutable instance. */
export type MutableActionContext = {
  /**
   * Whether the action has started and not yet finished.
   *
   * Not the same as being on the stack. An async action suspended at an
   * `await` is not running and is still going to write again, and the
   * difference between those two is what decides whether it is handed a
   * transaction to write into.
   */
  active: boolean;
};

export interface Internal<T extends CreateState = CreateState> {
  /**
   * The store module.
   */
  module: T;
  /**
   * The root state.
   */
  rootState: T | Draft<T>;
  /**
   * The backup state.
   */
  backupState: T | Draft<T>;
  /**
   * Finalize the draft.
   */
  finalizeDraft: () => [T, Patches, Patches];
  /**
   * Which action owns the open draft.
   *
   * There is one `internal.rootState`, so one transaction at a time, and only
   * its owner may finalize it. Ownership moves: an action takes it from
   * whoever held it on entry, and hands one back to them on the way out if
   * they have not finished.
   */
  mutableTransactionOwner?: MutableActionContext;
  /**
   * The mutable instance.
   */
  mutableInstance: any;
  /**
   * The sequence number.
   */
  sequence: number;
  /** Identifies the lifetime of the current shared authority. */
  transportEpoch?: string;
  /** Action paths declared when the authoritative store was initialized. */
  sharedActionPaths?: Set<string>;
  /**
   * Whether the batch is running.
   */
  isBatching: boolean;
  /** Depth of a cached getter/computed evaluation over immutable state. */
  computedReadDepth?: number;
  /** Frozen snapshots keyed by immutable state object identity. */
  computedSnapshotCache?: WeakMap<object, unknown>;
  /** Immutable state sources keyed by frozen computed snapshot identity. */
  computedSnapshotSources?: WeakMap<object, object>;
  /** Whether a computed getter has returned a state snapshot object. */
  computedIdentityRequired?: boolean;
  /**
   * The listeners.
   */
  listeners: Set<Listener>;
  /** Cleanup callbacks owned by transport and integration layers. */
  destroyCallbacks?: Set<() => void>;
  /**
   * Publish an externally-owned immutable state change to signal slots and
   * store subscribers.
   */
  notifyStateChange: () => void;
  /** Lazily-created deep dependency trie for immutable state reads. */
  reactivePathRoot?: ReactivePathNode;
  /** Number of currently-live reactive path dependency kinds. */
  reactivePathActiveCount?: number;
  /**
   * State keys that are allowed after initialization.
   */
  stateSchema?: StateSchema;
  /**
   * The act is used to run the function in the action for mutable state.
   */
  actMutable?: <T extends () => any>(fn: T) => ReturnType<T>;
  /**
   * Get the mutable raw instance via the initial state.
   */
  toMutableRaw?: (key: any) => any;
  /**
   * The update immutable function.
   */
  updateImmutable?: (state: T) => void;
  /**
   * Adapter-level authority check for low-level mutations.
   */
  assertMutationAllowed?: (operation: MutationOperation) => void;
  /**
   * Store lifecycle guard.
   */
  assertAlive?: (operation: StoreOperation) => void;
  /**
   * Authorized client-mirror state application used by transports.
   */
  applyClientState?: (state?: T, patches?: Patches) => void;
  /** Request an authoritative full sync for a client mirror. */
  syncClientState?: (
    expectedEpoch?: string,
    minimumSequence?: number
  ) => Promise<void>;
  /** Cancel a transport promise when the client mirror is destroyed. */
  awaitClientTransport?: <R>(value: PromiseLike<R> | R) => Promise<R>;
  /** Validate committed state when a runtime capability requires it. */
  validateState?: (state: unknown) => void;
  /** Validate outbound patches before normalization or commit. */
  validatePatches?: (patches: Patches) => void;
  /** Validate an adapter replacement source before reading its values. */
  validateReplacementSource?: (state: unknown) => void;
  /** Commit patches already checked by the native updater. */
  applyValidatedPatches?: (
    state: T,
    patches: Patches,
    skipFinalValidation: boolean
  ) => boolean;
  /** Publish patches when a shared authority transport is attached. */
  emitPatches?: (patches: Patches) => void;
  /** Return the plain state exposed at the JSON transport boundary. */
  getTransportState?: () => unknown;
}
