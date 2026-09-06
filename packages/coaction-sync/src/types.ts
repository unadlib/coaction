import type { MiddlewareStore, Store, StoreCommit } from 'coaction/adapter';

export type Patches = StoreCommit<any>['patches'];

export type SyncStorage = {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem(name: string): void | Promise<void>;
};

export type SyncMutation = {
  readonly id: string;
  readonly patches: Patches;
  readonly inversePatches: Patches;
  readonly createdAt: number;
};

export type SyncPullResult = {
  patches?: Patches;
  cursor?: string;
  revision?: string;
};

export type SyncPushResult = SyncPullResult & {
  /** Mutation ids durably accepted by the remote. Defaults to every submitted id. */
  ack?: string[];
};

export type SyncAdapter = {
  /**
   * Called once with the store this adapter was attached to, before any pull
   * or push. An adapter that has to read current state -- one mapping patches
   * onto records, say -- captures it here rather than making the caller thread
   * the store back into its own options.
   */
  bind?: (store: Store<any>) => void;
  pull(context: {
    cursor?: string;
    revision?: string;
  }): Promise<SyncPullResult>;
  push(
    mutations: readonly SyncMutation[],
    context: { cursor?: string; revision?: string }
  ): Promise<SyncPushResult>;
  subscribe?: (
    listener: (update: SyncPullResult) => void
  ) => void | (() => void);
  /**
   * Adapter state to write into the same durable checkpoint as the outbox.
   *
   * An adapter that reasons about the remote -- which records it already
   * holds, say -- must not keep that knowledge in memory while the mutations
   * it is reasoning about survive a restart. Whatever this returns is stored
   * with the outbox and handed back to `hydrate` before any pull or push.
   */
  serialize?: () => unknown;
  /** Restore what `serialize` wrote. Called once, before any pull or push. */
  hydrate?: (snapshot: unknown) => void;
  /**
   * A remote result the store has taken. Advance any view of the remote here.
   *
   * Doing it while producing the result instead would move the adapter ahead of
   * the store: a pull whose answer is discarded as stale, or a subscription
   * that arrives before hydration has restored the previous checkpoint, would
   * leave the adapter believing something the store never accepted. This runs
   * after the rebase and before the checkpoint is written, so the two are one
   * commit.
   */
  accept?: (result: SyncPullResult) => void;
};

export type SyncConflictResolution = 'local' | 'remote';

export type SyncConflictContext = {
  mutation: SyncMutation;
  remotePatches: Patches;
  overlappingRemotePatches: Patches;
};

export type SyncConflictPolicy =
  | 'local-wins'
  | 'remote-wins'
  | ((context: SyncConflictContext) => SyncConflictResolution);

export type SyncOptions = {
  name: string;
  adapter: SyncAdapter;
  /**
   * Where the outbox and snapshot are written. Defaults to `localStorage`.
   *
   * Pass `false` to accept an outbox that does not survive the process. There
   * is no silent fallback: a runtime without `localStorage` and without a
   * storage of its own is refused, because the outbox is the reason a crash
   * between an optimistic write and its delivery is recoverable.
   */
  storage?: SyncStorage | false;
  /** Persist the optimistic local snapshot alongside the durable outbox. */
  persistState?: boolean;
  /** Resolve overlapping remote/local patch paths during rebase. */
  conflict?: SyncConflictPolicy;
  retry?: { initialMs?: number; maxMs?: number; factor?: number };
  onError?: (error: unknown) => void;
  onStatusChange?: (status: SyncStatus) => void;
};

export type SyncStatus = 'hydrating' | 'idle' | 'syncing' | 'offline' | 'error';

export type SyncApi = {
  flush(): Promise<void>;
  pull(): Promise<void>;
  clearPending(): Promise<void>;
  getPending(): readonly SyncMutation[];
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
};

export type SyncedStore<T extends object> = Store<T> & { sync: SyncApi };

// A plain function type, not an intersection with `Middleware<T>`: the return
// type already subsumes it, and an intersection of two call signatures stops
// TypeScript inferring `T` from the `middlewares` option it is passed to,
// which would collapse the whole store's state type to `object`.
export type SyncMiddleware<T extends object> = (
  store: MiddlewareStore<T>
) => MiddlewareStore<T> & { sync: SyncApi };

export type PersistedSyncState<T extends object = object> = {
  /** See {@link CHECKPOINT_FORMAT_VERSION}. Absent means the first format. */
  formatVersion?: number;
  cursor?: string;
  revision?: string;
  outbox: SyncMutation[];
  state?: T;
  adapter?: unknown;
};
