import type { Patches } from 'mutative';
import type { CreateState, Store } from './interface';

export type StoreCommitSource =
  | 'setState'
  | 'mutableAction'
  | 'external'
  | 'replay';

/**
 * A patch pair emitted after Coaction has committed an authoritative state
 * transition.
 */
export type StoreCommit<T extends CreateState = CreateState> = {
  readonly state: T;
  readonly patches: Patches;
  readonly inversePatches: Patches;
  readonly source: StoreCommitSource;
};

/** Patch pair to replay through Coaction's authoritative mutation pipeline. */
export type StorePatchTransition = {
  readonly patches: Patches;
  readonly inversePatches: Patches;
};

export type StorePatchReplayOptions<T extends CreateState = CreateState> = {
  /** Middleware-scoped setState entry that should observe the replay. */
  setState?: Store<T>['setState'];
};

type StoreCommitListener<T extends CreateState> = (
  commit: StoreCommit<T>
) => void;

type StoreCommitPrepareListener<T extends CreateState> = (
  commit: StoreCommit<T>
) => boolean | void;

type StoreCommitValidator<T extends CreateState> = (
  commit: StoreCommit<T>
) => void;

type StorePatchReplayer<T extends CreateState> = (
  transition: StorePatchTransition,
  setState?: Store<T>['setState']
) => T;

type StoreCommitRuntime = {
  disposed: boolean;
  listeners: Set<StoreCommitListener<any>>;
  prepareListeners: Set<StoreCommitPrepareListener<any>>;
  validators: Set<StoreCommitValidator<any>>;
  source?: StoreCommitSource;
  replay?: StorePatchReplayer<any>;
};

const storeCommitRuntimeSymbol = Symbol.for('coaction.storeCommit.runtime');

const getStoreCommitRuntime = (store: object, create = false) => {
  const target = store as Record<PropertyKey, unknown>;
  const existing = target[storeCommitRuntimeSymbol] as
    | StoreCommitRuntime
    | undefined;
  if (existing || !create) {
    return existing;
  }
  const runtime: StoreCommitRuntime = {
    disposed: false,
    listeners: new Set(),
    prepareListeners: new Set(),
    validators: new Set()
  };
  Object.defineProperty(target, storeCommitRuntimeSymbol, {
    configurable: true,
    enumerable: true,
    value: runtime,
    writable: true
  });
  return runtime;
};

/**
 * Observe patch pairs after successful Coaction commits.
 *
 * @remarks
 * Registering a listener enables patch generation only while it is needed,
 * even when the store was created without `enablePatches: true`.
 */
export const onStoreCommit = <T extends CreateState>(
  store: Store<T>,
  listener: StoreCommitListener<T>
) => {
  const runtime = getStoreCommitRuntime(store, true)!;
  if (runtime.disposed) {
    throw new Error('onStoreCommit() cannot be called after store.destroy().');
  }
  runtime.listeners.add(listener);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    runtime.listeners.delete(listener);
  };
};

/**
 * Inspect a pending object-valued commit before its patch pair is applied.
 *
 * @remarks
 * Return `true` to request an exact state replacement for transitions whose
 * object graph cannot be represented safely by the patch pair.
 */
export const onStoreCommitPrepare = <T extends CreateState>(
  store: Store<T>,
  listener: StoreCommitPrepareListener<T>
) => {
  const runtime = getStoreCommitRuntime(store, true)!;
  if (runtime.disposed) {
    throw new Error(
      'onStoreCommitPrepare() cannot be called after store.destroy().'
    );
  }
  runtime.prepareListeners.add(listener);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    runtime.prepareListeners.delete(listener);
  };
};

/**
 * Refuse a state transition before it is committed.
 *
 * @remarks
 * A validator that throws aborts the transition: the error reaches whoever
 * called `setState`, and the store is left exactly as it was. This is the hook
 * for a middleware whose state space is narrower than Coaction's own -- one
 * that has to put the state somewhere Coaction does not, over a wire or into
 * storage, and so cannot represent everything a local write can produce.
 *
 * Learning about such a write from {@link onStoreCommit} is too late. By then
 * the store holds a value the middleware cannot carry, subscribers have
 * rendered it, and refusing it after the fact only means the two disagree from
 * there on with nothing left to say so.
 *
 * Every way into the state runs validators: `setState`, `store.apply()` with a
 * patch pair or with a replacement, and a patch replay. A replacement carries
 * no patch pair of its own, so the one the commit would be published with is
 * derived and checked instead.
 *
 * The exception is an external mutable adapter -- MobX, Valtio, Pinia -- which
 * owns the object and has already changed it by the time a commit exists.
 * There a middleware has only {@link onStoreCommit} to report from.
 *
 * A validator sees the commit a listener will see -- the same patch pair, the
 * same inverse, the same source. It must not write to the store, and it runs on
 * every local transition, so keep it proportional to the patches rather than to
 * the size of the state.
 */
export const onStoreCommitValidate = <T extends CreateState>(
  store: Store<T>,
  validator: StoreCommitValidator<T>
) => {
  const runtime = getStoreCommitRuntime(store, true)!;
  if (runtime.disposed) {
    throw new Error(
      'onStoreCommitValidate() cannot be called after store.destroy().'
    );
  }
  runtime.validators.add(validator);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    runtime.validators.delete(validator);
  };
};

/**
 * Replay a patch pair through Coaction validation, patch middleware, adapters,
 * subscriptions, and transports.
 */
export const replayStorePatches = <T extends CreateState>(
  store: Store<T>,
  transition: StorePatchTransition,
  options: StorePatchReplayOptions<T> = {}
): T => {
  const runtime = getStoreCommitRuntime(store);
  const replay = runtime?.disposed ? undefined : runtime?.replay;
  if (!replay) {
    throw new Error(
      'replayStorePatches() requires a store created by Coaction.'
    );
  }
  return replay(transition, options.setState);
};

/**
 * @internal
 * Validators need the patch pair too, so they count the same as listeners when
 * deciding whether a transition has to produce one.
 */
export const hasStoreCommitListeners = (store: object) => {
  const runtime = getStoreCommitRuntime(store);
  return Boolean(
    runtime && (runtime.listeners.size || runtime.validators.size)
  );
};

/** @internal */
export const publishStoreCommit = <T extends CreateState>(
  store: Store<T>,
  commit: StoreCommit<T>
) => {
  const runtime = getStoreCommitRuntime(store);
  if (!runtime || runtime.disposed || !runtime.listeners.size) {
    return;
  }
  for (const listener of [...runtime.listeners]) {
    listener(commit);
  }
};

/** @internal */
export const hasStoreCommitValidators = (store: object) =>
  Boolean(getStoreCommitRuntime(store)?.validators.size);

/** @internal */
export const validateStoreCommit = <T extends CreateState>(
  store: Store<T>,
  commit: StoreCommit<T>
) => {
  const runtime = getStoreCommitRuntime(store);
  if (!runtime || runtime.disposed || !runtime.validators.size) {
    return;
  }
  for (const validator of runtime.validators) {
    validator(commit);
  }
};

/** @internal */
export const prepareStoreCommit = <T extends CreateState>(
  store: Store<T>,
  commit: StoreCommit<T>
) => {
  const runtime = getStoreCommitRuntime(store);
  if (!runtime || runtime.disposed || !runtime.prepareListeners.size) {
    return false;
  }
  let replace = false;
  for (const listener of runtime.prepareListeners) {
    replace = listener(commit) === true || replace;
  }
  return replace;
};

/** @internal */
export const getStoreCommitSource = (
  store: object,
  fallback: StoreCommitSource
) => getStoreCommitRuntime(store)?.source ?? fallback;

/** @internal */
export const runWithStoreCommitSource = <T>(
  store: object,
  source: StoreCommitSource,
  callback: () => T
): T => {
  const runtime = getStoreCommitRuntime(store, true)!;
  const previousSource = runtime.source;
  runtime.source = source;
  try {
    return callback();
  } finally {
    runtime.source = previousSource;
  }
};

/** @internal */
export const registerStorePatchReplayer = <T extends CreateState>(
  store: Store<T>,
  replay: StorePatchReplayer<T>
) => {
  const runtime = getStoreCommitRuntime(store, true)!;
  runtime.replay = replay;
};

/** @internal */
export const disposeStoreCommitRuntime = (store: object) => {
  const runtime = getStoreCommitRuntime(store);
  if (!runtime) {
    return;
  }
  runtime.disposed = true;
  runtime.listeners.clear();
  runtime.prepareListeners.clear();
  runtime.validators.clear();
  runtime.source = undefined;
  runtime.replay = undefined;
};
