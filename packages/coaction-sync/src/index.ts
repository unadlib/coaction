import {
  applyPatches,
  assertSharedJsonValue,
  createInversePatches,
  onStoreCommit,
  onStoreCommitValidate,
  onStoreReady,
  replayStorePatches,
  sanitizeReplacementState,
  type MiddlewareStore,
  type Store,
  type StoreCommit
} from 'coaction/adapter';
import { normalizePatchPath, readAtPath } from './paths';
import { resolveStorage } from './storage';
import {
  cloneMutation,
  clonePatches,
  createMutationId,
  describeWrite,
  getOverlappingRemotePatches,
  mergeMutationsById
} from './mutations';
import {
  assertRemotePatches,
  CHECKPOINT_FORMAT_VERSION,
  parseJournal,
  readCheckpointBody,
  readOutbox,
  reject
} from './checkpoint';
import type {
  Patches,
  PersistedSyncState,
  SyncApi,
  SyncConflictResolution,
  SyncMiddleware,
  SyncMutation,
  SyncOptions,
  SyncPullResult,
  SyncStatus,
  SyncedStore
} from './types';

export * from './types';
export {
  createFetchSyncAdapter,
  type FetchSyncAdapterOptions
} from './fetchAdapter';

/**
 * Local-first middleware built on Coaction's commit/patch IR.
 *
 * Local mutations are written to a durable outbox before network delivery.
 * Pulls rollback optimistic commits, apply the remote base, then replay the
 * optimistic commits so local UI remains responsive while preserving a valid
 * inverse transition for the next rebase.
 */
export const sync = <T extends object>({
  name,
  adapter,
  storage: storageOption,
  persistState = true,
  conflict = 'local-wins',
  retry = {},
  onError,
  onStatusChange
}: SyncOptions): SyncMiddleware<T> =>
  ((store: Store<T>) => {
    if (store.share === 'client') {
      throw new Error(
        'sync() is not supported on a client mirror. Attach it to the local or authoritative main store.'
      );
    }
    const storage = resolveStorage(storageOption, name);
    const checkpointLabel = `The durable checkpoint for sync({ name: '${name}' })`;
    /**
     * The outbox, the snapshot and the adapter's baseline are all stored as
     * JSON, so state JSON cannot represent is not persisted -- it is quietly
     * changed. A `Date` comes back a string, a `Map` comes back `{}`, and
     * nothing says so until something downstream reads the wrong type. The
     * contract is the one the shared transport already enforces, so it is the
     * same check.
     */
    const assertJsonState = (value: unknown, what: string) => {
      try {
        assertSharedJsonValue(value);
      } catch (error) {
        throw new TypeError(
          `sync({ name: '${name}' }) stores state as JSON, and ${what} cannot be. ${(error as Error).message}`
        );
      }
    };
    /**
     * Read the durable checkpoint.
     *
     * Everything here came off storage, which is untrusted: another build
     * wrote it, or something else is using the key, or half of it survived a
     * crash. The type assertion this replaced was a claim about it, not a
     * check of it, and anything it got wrong surfaced much further in -- a
     * malformed mutation as an error about patches, a newer format as whatever
     * that format happens to look like to this one.
     */
    const readCheckpoint = (raw: string | null): PersistedSyncState<T> => {
      if (!raw) return { outbox: [] };
      const checkpoint = readCheckpointBody(raw, checkpointLabel);
      for (const key of ['cursor', 'revision'] as const) {
        const value = checkpoint[key];
        if (value !== undefined && typeof value !== 'string') {
          reject(checkpointLabel, `has a ${key} that is not a string`);
        }
      }
      // The snapshot is handed to `store.apply` as a whole replacement, so a
      // scalar or an array here is a state this store cannot have.
      const state = checkpoint.state;
      if (
        state !== undefined &&
        (typeof state !== 'object' || state === null || Array.isArray(state))
      ) {
        reject(checkpointLabel, 'has a state that is not an object');
      }
      return {
        cursor: checkpoint.cursor as string | undefined,
        revision: checkpoint.revision as string | undefined,
        outbox: readOutbox(checkpoint.outbox, checkpointLabel),
        state: state as T | undefined,
        adapter: checkpoint.adapter
      };
    };
    adapter.bind?.(store);
    let outbox: SyncMutation[] = [];
    let cursor: string | undefined;
    let revision: string | undefined;
    let status: SyncStatus = 'hydrating';
    let destroyed = false;
    let hydrated = false;
    let applyingRemote = 0;
    let writeQueue = Promise.resolve();
    let pullPromise: Promise<void> | undefined;
    let remoteLane = Promise.resolve();
    // Counts remote facts that have arrived. A request captures it when it is
    // sent and compares on return: a change means the state it was computed
    // against is gone.
    let remoteEpoch = 0;
    // A pull that failed is work still owed. Retrying only the flush would
    // report recovery while the remote state was never fetched.
    let pullOwed = false;
    let flushPromise: Promise<void> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = Math.max(1, retry.initialMs ?? 500);
    const maxRetry = Math.max(retryDelay, retry.maxMs ?? 30_000);
    const retryFactor = Math.max(1, retry.factor ?? 2);
    const statusListeners = new Set<(status: SyncStatus) => void>();
    const hydrationJournalName = `${name}::coaction-sync-pre-hydration`;
    const journalLabel = `The pre-hydration journal for sync({ name: '${name}' })`;
    const readStorage = (key: string) => {
      try {
        return Promise.resolve(storage.getItem(key));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    // Start both reads before user code can mutate the returned store. The
    // separate journal lets async storage persist early local commits without
    // overwriting the not-yet-hydrated durable snapshot.
    const initialStateRead = readStorage(name);
    const initialJournalRead = readStorage(hydrationJournalName);
    // The journal read is only awaited when a commit lands before hydration
    // finishes, so a storage failure would otherwise surface as an unhandled
    // rejection in the common case where none does. The promise stays rejected
    // for whoever does await it, exactly as the hydration promise below.
    void initialJournalRead.catch(() => undefined);

    const setStatus = (next: SyncStatus) => {
      if (status === next) return;
      status = next;
      onStatusChange?.(next);
      statusListeners.forEach((listener) => listener(next));
    };
    const serialize = (): PersistedSyncState<T> => {
      const adapterSnapshot = adapter.serialize?.();
      if (adapterSnapshot !== undefined) {
        // The adapter's baseline goes into the same JSON checkpoint the state
        // does, and JSON changes it just as quietly: a `Date` in it comes back
        // a string, a `Map` comes back `{}`. The state has been checked since
        // the middleware was written; this was not, and it is the harder of
        // the two to notice afterwards -- it is what the adapter consults to
        // decide which records the remote already has.
        assertJsonState(adapterSnapshot, 'this adapter snapshot');
      }
      return {
        formatVersion: CHECKPOINT_FORMAT_VERSION,
        cursor,
        revision,
        outbox,
        adapter: adapterSnapshot,
        state: persistState
          ? (sanitizeReplacementState(store.getPureState()) as T)
          : undefined
      };
    };
    const persist = () => {
      // Encoding inside the queued work, not before it: a value JSON cannot
      // represent would otherwise throw straight back out of the `set()` that
      // committed it, after the state had already changed. Here it fails the
      // write like any other storage failure, and `onError` reports it.
      writeQueue = writeQueue
        .catch(() => undefined)
        .then(() => storage.setItem(name, JSON.stringify(serialize())));
      return writeQueue;
    };
    const persistPreHydration = () => {
      const current = [...outbox];
      writeQueue = writeQueue
        .catch(() => undefined)
        .then(async () => {
          const prior = parseJournal(await initialJournalRead, journalLabel);
          const merged = mergeMutationsById(prior, current);
          await storage.setItem(
            hydrationJournalName,
            JSON.stringify({
              formatVersion: CHECKPOINT_FORMAT_VERSION,
              outbox: merged
            })
          );
        });
      return writeQueue;
    };
    const clearRetryTimer = () => {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = undefined;
    };
    const scheduleRetry = () => {
      if (destroyed || retryTimer) return;
      setStatus('offline');
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        const resume = pullOwed ? pull().then(() => flush()) : flush();
        void resume.catch(() => undefined);
      }, retryDelay);
      retryDelay = Math.min(maxRetry, retryDelay * retryFactor);
    };
    const reportError = (error: unknown) => {
      setStatus('error');
      onError?.(error);
      scheduleRetry();
    };

    /**
     * Replay one optimistic mutation onto the current base and return it with
     * a refreshed inverse, or `undefined` when it can no longer be applied.
     *
     * A remote change can remove the ground a pending mutation stood on — the
     * parent of an edited field gets deleted, say. Such a mutation can never
     * apply again, so it is dropped rather than kept: retaining it would throw
     * out of this rebase and every later one, leaving the outbox permanently
     * wedged and the store stuck retrying an error it cannot recover from.
     * The drop is reported through `onError` so the application can tell the
     * user their edit was lost, but it does not fail the sync itself.
     */
    const replayOptimisticMutation = (
      mutation: SyncMutation,
      base: T
    ): { mutation: SyncMutation; state: T } | undefined => {
      try {
        const inverse = createInversePatches(base, mutation.patches) as Patches;
        return {
          mutation: { ...mutation, inversePatches: clonePatches(inverse) },
          state: applyPatches(base, mutation.patches)
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        onError?.(
          new Error(
            `@coaction/sync dropped pending mutation "${mutation.id}": it no longer applies to the current state (${reason})`
          )
        );
        return undefined;
      }
    };

    type ArrayShift = {
      arrayPath: PropertyKey[];
      index: number;
      delta: number;
    };

    const isIndexSegment = (segment: PropertyKey) =>
      /^(0|[1-9]\d*)$/.test(String(segment));

    /** Array entries the remote inserted or removed, with how far they move. */
    const readArrayShifts = (remotePatches: Patches, base: T): ArrayShift[] => {
      const shifts: ArrayShift[] = [];
      for (const patch of remotePatches) {
        if (patch.op !== 'add' && patch.op !== 'remove') continue;
        const path = normalizePatchPath(patch.path);
        const last = path[path.length - 1];
        if (last === undefined || !isIndexSegment(last)) continue;
        const arrayPath = path.slice(0, -1);
        if (!Array.isArray(readAtPath(base, arrayPath))) continue;
        shifts.push({
          arrayPath,
          index: Number(last),
          delta: patch.op === 'add' ? 1 : -1
        });
      }
      return shifts;
    };

    /**
     * Move a pending patch to wherever the record it named ended up: an index
     * is a position, not an identity. Undefined when the entry the patch named
     * is the one the remote removed.
     */
    const shiftPatch = (
      patch: Patches[number],
      shifts: readonly ArrayShift[]
    ): Patches[number] | undefined => {
      const path = Array.isArray(patch.path)
        ? [...(patch.path as PropertyKey[])]
        : normalizePatchPath(patch.path);
      let changed = false;
      for (const shift of shifts) {
        const depth = shift.arrayPath.length;
        if (path.length <= depth) continue;
        let matches = true;
        for (let index = 0; index < depth; index += 1) {
          if (String(path[index]) !== String(shift.arrayPath[index])) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        const segment = path[depth];
        if (!isIndexSegment(segment)) continue;
        const position = Number(segment);
        if (shift.delta < 0 && position === shift.index) return undefined;
        if (position < shift.index) continue;
        path[depth] =
          typeof segment === 'number'
            ? position + shift.delta
            : String(position + shift.delta);
        changed = true;
      }
      return changed ? ({ ...patch, path } as Patches[number]) : patch;
    };

    const shiftMutation = (
      mutation: SyncMutation,
      shifts: readonly ArrayShift[]
    ): SyncMutation | undefined => {
      if (!shifts.length) return mutation;
      const patches: Patches = [];
      for (const patch of mutation.patches) {
        const shifted = shiftPatch(patch, shifts);
        if (!shifted) {
          onError?.(
            new Error(
              `@coaction/sync dropped pending mutation "${mutation.id}": the array entry it edited was removed by the remote`
            )
          );
          return undefined;
        }
        patches.push(shifted);
      }
      return { ...mutation, patches };
    };

    /** Replay mutations onto a working copy as one net transition. */
    const replaySequence = (base: T, mutations: readonly SyncMutation[]) => {
      let state = base;
      const patches: Patches = [];
      let inversePatches: Patches = [];
      const replayed: SyncMutation[] = [];
      for (const mutation of mutations) {
        const result = replayOptimisticMutation(mutation, state);
        if (!result) continue;
        replayed.push(result.mutation);
        state = result.state;
        patches.push(...result.mutation.patches);
        inversePatches = [...result.mutation.inversePatches, ...inversePatches];
      }
      return { state, patches, inversePatches, mutations: replayed };
    };

    /**
     * Roll back the optimistic mutations, take the remote patches, replay what
     * survived the conflict policy -- as one commit.
     *
     * Those are three states and only the last is true, so they are computed
     * against a working copy rather than published one by one. A failure
     * part-way through then leaves neither the store nor the outbox touched.
     */
    const rebase = (remotePatches?: Patches) => {
      if (!remotePatches?.length) return;
      const previousOutbox = outbox;
      const forward: Patches = [];
      let backward: Patches = [];
      let working = store.getPureState() as T;
      const stage = (patches: Patches, inverse: Patches) => {
        working = applyPatches(working, patches);
        forward.push(...patches);
        backward = [...inverse, ...backward];
      };

      for (let index = previousOutbox.length - 1; index >= 0; index -= 1) {
        const mutation = previousOutbox[index];
        stage(mutation.inversePatches, mutation.patches);
      }
      stage(
        remotePatches,
        createInversePatches(working, remotePatches) as Patches
      );

      // A resolver is called in the middle of the rebase, over the mutations
      // about to be replayed and the patches about to be applied, so it is
      // shown copies -- reaching into either would be editing the rebase's own
      // working set while it runs. Each call gets its own: sharing one copy of
      // the remote patches across the pass kept the rebase safe but let one
      // call's edits show up in the next one's context, which is a resolver
      // reasoning about a conflict from data another conflict left behind.
      const retained = previousOutbox.filter((mutation) => {
        const overlappingRemotePatches = getOverlappingRemotePatches(
          mutation,
          remotePatches
        );
        if (!overlappingRemotePatches.length) return true;
        const resolution =
          typeof conflict === 'function'
            ? conflict({
                mutation: cloneMutation(mutation),
                remotePatches: clonePatches(remotePatches),
                overlappingRemotePatches: clonePatches(overlappingRemotePatches)
              })
            : conflict === 'remote-wins'
              ? 'remote'
              : 'local';
        return resolution !== 'remote';
      });

      const shifts = readArrayShifts(remotePatches, store.getPureState() as T);
      const shifted = retained
        .map((mutation) => shiftMutation(mutation, shifts))
        .filter((mutation): mutation is SyncMutation => Boolean(mutation));
      const replayed = replaySequence(working, shifted);
      stage(replayed.patches, replayed.inversePatches);

      applyingRemote += 1;
      try {
        replayStorePatches(store, {
          patches: forward,
          inversePatches: backward
        });
      } finally {
        applyingRemote -= 1;
      }
      outbox = replayed.mutations;
    };

    const applyRemoteResult = async (result: SyncPullResult) => {
      if (destroyed) return;
      // Every remote answer arrives through here -- a pull, a push response, a
      // subscription update -- so this is where they are checked, before the
      // rebase reads them.
      assertRemotePatches(
        result.patches,
        `The remote for sync({ name: '${name}' })`
      );
      rebase(result.patches);
      cursor = result.cursor ?? cursor;
      revision = result.revision ?? revision;
      adapter.accept?.(result);
      await persist();
    };

    /**
     * One lane for every remote result, whatever produced it.
     *
     * A pull, a push and a subscription are three sources writing the same
     * state. Applied independently they interleave -- one rebase reading a
     * working copy another is part-way through replacing -- and the order the
     * store ends up in is whichever finished last. Serialising them makes
     * arrival order the only order.
     */
    const enqueueRemote = (work: () => Promise<void>) => {
      remoteLane = remoteLane.catch(() => undefined).then(work);
      return remoteLane;
    };

    /**
     * A remote result the store should take.
     *
     * The epoch moves on arrival rather than on application. A fact that has
     * arrived is a fact whatever is still in flight was computed without, even
     * if it is still queued behind other work -- counting it only once applied
     * leaves a window where a pull returning inside it looks current.
     */
    const applyRemote = (result: SyncPullResult) => {
      remoteEpoch += 1;
      return enqueueRemote(async () => {
        if (destroyed) return;
        await applyRemoteResult(result);
      });
    };

    /**
     * A pull's answer, which is only true of the base it was asked about.
     *
     * The check runs inside the lane rather than before entering it: between a
     * check outside and the work it guards, another result can arrive, and the
     * answer would then be applied over it.
     */
    const applyPullResult = async (result: SyncPullResult, epoch: number) => {
      let applied = false;
      await enqueueRemote(async () => {
        if (destroyed || epoch !== remoteEpoch) return;
        remoteEpoch += 1;
        await applyRemoteResult(result);
        applied = true;
      });
      return applied;
    };

    const doPull = async () => {
      if (destroyed) return;
      await hydration;
      setStatus('syncing');
      try {
        for (let attempt = 0; ; attempt += 1) {
          const epoch = remoteEpoch;
          const result = await adapter.pull({ cursor, revision });
          if (destroyed) return;
          if (await applyPullResult(result, epoch)) break;
          // Something else advanced the remote state while this was in flight.
          // A pull answers "what changed since the cursor I sent", and that
          // cursor has moved, so applying the answer would rewind. Ask again
          // from where the store actually is -- but not forever: a busy
          // subscription would otherwise starve the pull.
          if (attempt >= 2) {
            pullOwed = true;
            scheduleRetry();
            return;
          }
        }
        pullOwed = false;
        clearRetryTimer();
        retryDelay = Math.max(1, retry.initialMs ?? 500);
        setStatus('idle');
      } catch (error) {
        pullOwed = true;
        reportError(error);
        throw error;
      }
    };

    /**
     * Overlapping pulls share one request, the way overlapping flushes do: two
     * in flight have no ordering, so the later response can carry the older
     * revision and overwrite newer state with it.
     */
    const pull = () => {
      if (!pullPromise) {
        pullPromise = doPull().finally(() => {
          pullPromise = undefined;
        });
      }
      return pullPromise;
    };

    const doFlush = async () => {
      await hydration;
      if (destroyed) return;
      setStatus('syncing');
      try {
        // A local commit may arrive while a push is in flight. Track ids already
        // attempted by this flush so newly appended commits are delivered in the
        // same flush without hot-looping mutations the remote chose not to ack.
        const attempted = new Set<string>();
        let declined = false;
        while (!destroyed) {
          // Nothing goes to the remote before it is durable. The commit path
          // persists then flushes, but an explicit `flush()` does not go
          // through it, and a crash between sending and persisting would leave
          // a mutation the remote has and the outbox does not. Waiting on the
          // write queue here makes the ordering a property of the sender
          // rather than of how it was called; a failed write rejects and the
          // retry schedule owns what happens next.
          await writeQueue;
          if (destroyed) return;
          const submitted = outbox.filter(({ id }) => !attempted.has(id));
          if (!submitted.length) break;
          submitted.forEach(({ id }) => attempted.add(id));
          // Stable mutation ids make retry after an ack-persist crash safe when
          // the remote treats ids idempotently.
          const epoch = remoteEpoch;
          const result = await adapter.push(submitted.map(cloneMutation), {
            cursor,
            revision
          });
          if (destroyed) return;
          const ack = new Set(result.ack ?? submitted.map(({ id }) => id));
          declined ||= submitted.some(({ id }) => !ack.has(id));
          outbox = outbox.filter(({ id }) => !ack.has(id));
          // Every answer from the remote goes through the same lane, patches
          // or not. A push that reports nothing but success is still the remote
          // telling this client something it did not know -- and a pull in
          // flight asked its question before it. Which is exactly what the
          // built-in CRUD adapters return.
          //
          // A lane orders answers by arrival, and arrival is not the order the
          // server committed them in. This answer says what the server made of
          // a write it took before anything that has landed since, so applying
          // it now would put that older value back over the newer one. The
          // acknowledgement still stands -- the remote did take the mutations
          // -- but the state it describes is no longer the state, and only a
          // pull can say what is.
          const superseded = epoch !== remoteEpoch;
          if (superseded) pullOwed = true;
          await applyRemote(
            superseded
              ? {}
              : {
                  patches: result.patches,
                  cursor: result.cursor,
                  revision: result.revision
                }
          );
        }
        if (declined) {
          // The remote took some mutations and refused others. Re-sending the
          // refused ones inside this loop would hot-loop against a remote that
          // keeps refusing, and calling it idle would strand them until some
          // unrelated commit happens to flush again, so hand them to the
          // backoff timer instead.
          scheduleRetry();
          return;
        }
        if (pullOwed) {
          // Sending succeeded, but the remote state is still unfetched.
          // Clearing the timer would cancel the retry that owes a pull.
          scheduleRetry();
          return;
        }
        clearRetryTimer();
        retryDelay = Math.max(1, retry.initialMs ?? 500);
        setStatus('idle');
      } catch (error) {
        reportError(error);
        throw error;
      }
    };

    const flush = () => {
      if (!flushPromise) {
        flushPromise = doFlush().finally(() => {
          flushPromise = undefined;
        });
      }
      return flushPromise;
    };

    let hydrationSucceeded = false;
    const hydration = initialStateRead
      .then(async (raw) => {
        if (destroyed) return;
        // Include any journal writes produced by mutations that occurred while
        // the main durable snapshot read was pending.
        await writeQueue.catch(() => undefined);
        const journalRaw = await storage.getItem(hydrationJournalName);
        if (destroyed) return;

        const parsed = readCheckpoint(raw);
        cursor = parsed.cursor;
        revision = parsed.revision;
        // Before anything is pulled, pushed or replayed: the adapter's view of
        // the remote has to be as old as the outbox it will interpret.
        adapter.hydrate?.(parsed.adapter);
        const durable = parsed.outbox;
        const durableIds = new Set(durable.map(({ id }) => id));
        const inMemoryPreHydration = [...outbox];
        const journalPending = parseJournal(journalRaw, journalLabel).filter(
          ({ id }) => !durableIds.has(id)
        );
        const preHydration = mergeMutationsById(
          journalPending,
          inMemoryPreHydration
        ).filter(({ id }) => !durableIds.has(id));

        applyingRemote += 1;
        try {
          if (persistState && parsed.state) {
            store.apply(parsed.state as T);
          } else {
            // Backwards compatibility for payloads written before optimistic
            // snapshots were persisted. Only in-memory commits are already
            // applied to this fresh store, so rollback those before restoring
            // the durable chronological base. Journal-only mutations are
            // replayed below with the rest of the hydration-window commits.
            for (
              let index = inMemoryPreHydration.length - 1;
              index >= 0;
              index -= 1
            ) {
              const mutation = inMemoryPreHydration[index];
              replayStorePatches(store, {
                patches: mutation.inversePatches,
                inversePatches: mutation.patches
              });
            }
            for (const mutation of durable) {
              replayStorePatches(store, {
                patches: mutation.patches,
                inversePatches: mutation.inversePatches
              });
            }
          }

          const rebasedPreHydration = replaySequence(
            store.getPureState() as T,
            preHydration
          );
          if (rebasedPreHydration.patches.length) {
            replayStorePatches(store, {
              patches: rebasedPreHydration.patches,
              inversePatches: rebasedPreHydration.inversePatches
            });
          }
          outbox = [...durable, ...rebasedPreHydration.mutations];
          hydrationSucceeded = true;
        } finally {
          applyingRemote -= 1;
        }
      })
      .catch((error) => {
        setStatus('error');
        onError?.(error);
        throw error;
      })
      .finally(() => {
        if (!hydrationSucceeded) return;
        hydrated = true;
        setStatus('idle');
        if (!destroyed) {
          void persist()
            .then(() => storage.removeItem(hydrationJournalName))
            .then(() => flush())
            .catch(reportError);
        }
      });
    // Avoid an unhandled rejection when hydration fails before the caller uses
    // sync.flush()/pull(). The original promise remains rejected so explicit
    // sync operations still surface the hydration failure.
    void hydration.catch(() => undefined);

    let unsubscribeCommit: (() => void) | undefined;
    let unsubscribeValidate: (() => void) | undefined;
    const cancelReady = onStoreReady(store, () => {
      assertJsonState(store.getPureState(), 'this store');
      // Refuse a write this store could not carry, rather than report it after
      // the fact. A rejected write used to be committed locally and then
      // dropped from the outbox, so the store went on serving a value the
      // remote would never hear about and every later write was a delta from a
      // baseline only this client had. Nothing said so: the state looked fine,
      // sync looked idle, and the two agreed about the past forever after.
      unsubscribeValidate = onStoreCommitValidate<T>(store, (commit) => {
        if (destroyed || applyingRemote) return;
        // Per patch rather than over the whole state: proportional to the
        // change, and it catches a value introduced after the store was built,
        // which the check at startup cannot see.
        for (const patch of commit.patches) {
          if ('value' in patch)
            assertJsonState(patch.value, describeWrite(patch));
        }
      });
      unsubscribeCommit = onStoreCommit<T>(store, (commit: StoreCommit<T>) => {
        // `applyingRemote` covers every replay this middleware makes, so the
        // commit source is not consulted: a replay from anywhere else is a user
        // action, and `@coaction/history` undo and redo arrive that way.
        if (destroyed || applyingRemote) return;
        if (!commit.patches.length) return;
        try {
          // A write that reaches here without having passed the validator got
          // in through a path that commits before Coaction can refuse it -- an
          // external mutable adapter, where the object has already changed by
          // the time the commit exists. Reporting it is all that is left.
          for (const patch of commit.patches) {
            if ('value' in patch)
              assertJsonState(patch.value, describeWrite(patch));
          }
        } catch (error) {
          onError?.(error);
          return;
        }
        outbox.push({
          id: createMutationId(),
          patches: clonePatches(commit.patches),
          inversePatches: clonePatches(commit.inversePatches),
          createdAt: Date.now()
        });
        // Persist first. Before async hydration finishes, write to a separate
        // journal so the unread main snapshot cannot be overwritten.
        const durableWrite = hydrated ? persist() : persistPreHydration();
        void durableWrite
          .then(() => {
            if (hydrated) return flush();
          })
          .catch(reportError);
      });
    });

    const unsubscribeRemote = adapter.subscribe?.((update) => {
      void hydration.then(() => applyRemote(update)).catch(reportError);
    });

    const api: SyncApi = {
      flush,
      pull,
      clearPending: async () => {
        await hydration;
        outbox = [];
        await persist();
        await storage.removeItem(hydrationJournalName);
      },
      getPending: () => outbox.map(cloneMutation),
      getStatus: () => status,
      subscribe: (listener) => {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
      }
    };
    Object.assign(store, { sync: api });

    const baseDestroy = store.destroy;
    store.destroy = () => {
      if (destroyed) return;
      destroyed = true;
      clearRetryTimer();
      statusListeners.clear();
      cancelReady();
      unsubscribeCommit?.();
      unsubscribeValidate?.();
      unsubscribeCommit = undefined;
      if (typeof unsubscribeRemote === 'function') unsubscribeRemote();
      baseDestroy();
    };
    return store as MiddlewareStore<T> & { sync: SyncApi };
  }) as SyncMiddleware<T>;

/** Type-safe access to the API installed by sync(). */
export const getSyncApi = <T extends object>(store: Store<T>): SyncApi => {
  const api = (store as SyncedStore<T>).sync;
  if (!api) {
    throw new Error('getSyncApi() requires a store enhanced with sync().');
  }
  return api;
};
