import type { Store } from 'coaction';
import type {
  SyncAdapter,
  SyncMutation,
  SyncPullResult,
  SyncPushResult
} from './index';
import {
  childKeyUnder,
  normalizePatchPath,
  reachesPath,
  readAtPath
} from './paths';

type Patches = SyncPullResult['patches'];

/** A record set keyed by id, as it is held in the store. */
export type CrudCollection<TRecord> = Record<string, TRecord>;

export type CrudListContext = {
  cursor?: string;
  revision?: string;
};

export type CrudListResult<TRecord> = {
  records: TRecord[];
  cursor?: string;
  revision?: string;
  /** Ids the remote reports as gone, when it can say so incrementally. */
  deleted?: string[];
};

/**
 * A mutation needed an operation the adapter was not given a handler for.
 *
 * Skipping it would let the push succeed, which acknowledges the mutation and
 * drops it from the outbox -- the remote never hears about the change and
 * nothing reports that it did not.
 */
export class UnsupportedCrudOperationError extends Error {
  constructor(
    readonly operation: 'create' | 'update' | 'delete',
    readonly recordId: string
  ) {
    super(
      `@coaction/sync: the CRUD adapter has no "${operation}" handler, so record "${recordId}" cannot be synchronized. The mutation stays in the outbox.`
    );
    this.name = 'UnsupportedCrudOperationError';
  }
}

/**
 * A CRUD adapter, plus the hook a wrapping adapter uses to tell it what the
 * remote holds when records arrive by some route other than `pull`.
 */
export type CrudSyncAdapter = SyncAdapter & {
  observeRemotePatches(
    patches: Patches,
    options?: {
      /**
       * Whether a removal proves the record is gone from the remote.
       *
       * False when the patches come from a narrowed read: a record can leave a
       * query while still existing, and forgetting it there would send the next
       * write as a create.
       */
      removalMeansGone?: boolean;
    }
  ): void;
};

/**
 * What a write is being made for, handed to every CRUD handler.
 *
 * The sync core gives a mutation a stable id so a remote that dedupes on it can
 * make a retry after a crash safe -- there is always a window between the
 * remote committing and the acknowledgement being persisted, and everything in
 * it is replayed on restart. The CRUD handlers took only a record, which
 * dropped that id on the floor: no backend built on this adapter could honour
 * the contract the outbox was written for.
 */
export type CrudOperationContext = {
  operation: 'create' | 'update' | 'delete';
  /** The record's key. */
  recordId: string;
  /** Queued mutations this write carries, in the order they were made. */
  mutationIds: readonly string[];
  /**
   * A stable key for this write, naming the queued work and the record.
   *
   * `operation` is deliberately not part of it. Which call a mutation becomes
   * is decided against the baseline at send time, and the baseline can move
   * between two attempts at the same queued work -- a realtime update reporting
   * the row the first attempt created turns a retried create into an update.
   * Folding that in would give the same work two identities and defeat the
   * deduplication this key exists for.
   */
  idempotencyKey: string;
};

export type CrudSyncAdapterOptions<TRecord> = {
  /**
   * Where the keyed collection lives in the store, e.g. `['todos']` for a
   * store shaped `{ todos: { [id]: Todo } }`.
   */
  path: readonly PropertyKey[];
  /** Fetch records. Return an array, or a result carrying a cursor. */
  list: (
    context: CrudListContext
  ) => Promise<TRecord[] | CrudListResult<TRecord>>;
  /**
   * Handlers are optional only in the sense that an adapter may not need one.
   * A mutation that does need a missing handler fails the push rather than
   * being acknowledged, so the outbox keeps it.
   */
  create?: (
    record: TRecord,
    context: CrudOperationContext
  ) => Promise<TRecord | void>;
  update?: (
    record: TRecord,
    context: CrudOperationContext
  ) => Promise<TRecord | void>;
  /** Receives the last record known for the id, which may be stale. */
  delete?: (
    record: TRecord,
    id: string,
    context: CrudOperationContext
  ) => Promise<void>;
  /** Read a record's key. Defaults to its `id` field. */
  getId?: (record: TRecord) => string;
  /**
   * Treat a list response as the whole truth: a record the store holds but the
   * response omits is deleted locally. Leave off for cursor-paged or
   * changes-since endpoints, where an omission only means "not in this page".
   */
  authoritativeList?: boolean;
  /** Called before `create` for a record the remote has never seen. */
  onCreateError?: (error: unknown, record: TRecord) => void;
};

const asListResult = <TRecord>(
  result: TRecord[] | CrudListResult<TRecord>
): CrudListResult<TRecord> =>
  Array.isArray(result) ? { records: result } : result;

/**
 * Map a keyed collection in the store onto list/create/update/delete calls.
 *
 * Coaction syncs commits, not resources: a mutation carries patches, and a
 * CRUD endpoint wants whole records. This adapter is the translation. A pull
 * turns records into patches at `path`; a push reads the ids a mutation
 * touched, looks each one up in the store, and calls create, update or delete
 * depending on whether the remote has seen it and whether it still exists.
 *
 * ```ts
 * const store = create(
 *   () => ({ todos: {} as Record<string, Todo> }),
 *   {
 *     middlewares: [
 *       sync({
 *         name: 'todos',
 *         adapter: createCrudSyncAdapter<Todo>({
 *           path: ['todos'],
 *           list: () => api.listTodos(),
 *           create: (todo) => api.createTodo(todo),
 *           update: (todo) => api.updateTodo(todo),
 *           delete: (todo) => api.deleteTodo(todo.id)
 *         })
 *       })
 *     ]
 *   }
 * );
 * ```
 *
 * A failed write rejects the whole push rather than acknowledging part of it,
 * so the outbox keeps every mutation the remote did not take and the retry
 * schedule owns when to try again.
 */
export const createCrudSyncAdapter = <TRecord extends object>({
  path,
  list,
  create,
  update,
  delete: remove,
  getId = (record) => (record as { id: string }).id,
  authoritativeList = false,
  onCreateError
}: CrudSyncAdapterOptions<TRecord>): CrudSyncAdapter => {
  let store: Store<any> | undefined;
  /**
   * Which ids the remote is believed to hold. This decides create vs update,
   * so it is durable: the outbox it interprets survives a restart, and a
   * baseline that does not would call `create` on a record the remote already
   * has -- a primary key collision, on every backend that has one.
   */
  const remoteIds = new Set<string>();
  // Records seen from the remote, kept only to give `delete` something to work
  // from. Losing it costs nothing: the queue's inverse patches carry the value
  // for anything the store itself held.
  const known = new Map<string, TRecord>();

  const collection = (): CrudCollection<TRecord> =>
    (readAtPath(store?.getPureState(), path) as CrudCollection<TRecord>) ?? {};

  const seeRemoteRecord = (id: string, record?: TRecord) => {
    remoteIds.add(id);
    if (record !== undefined) known.set(id, record);
  };
  const forgetRemoteRecord = (id: string) => {
    remoteIds.delete(id);
    known.delete(id);
  };

  /**
   * Learn what the remote holds from patches applied outside `pull`.
   *
   * A realtime subscription writes records straight into the store, and
   * without this the baseline would never hear about them: the next local edit
   * to such a record would be sent as a create.
   */
  const observeRemotePatches = (
    patches: Patches,
    { removalMeansGone = true }: { removalMeansGone?: boolean } = {}
  ) => {
    for (const patch of patches ?? []) {
      const patchPath = normalizePatchPath(patch.path);
      const id = childKeyUnder(patchPath, path);
      if (id === undefined || patchPath.length !== path.length + 1) continue;
      if (patch.op === 'remove') {
        if (removalMeansGone) forgetRemoteRecord(id);
        continue;
      }
      seeRemoteRecord(id, (patch as { value?: TRecord }).value);
    }
  };

  /**
   * What each mutation asked for, read from its patches rather than inferred
   * from current state plus an in-memory map.
   *
   * The distinction matters across a restart: the outbox is durable and an
   * in-memory map is not, so a pending delete whose record is already gone
   * locally has to be recognisable from the queue alone. A record the queue
   * also creates was never on the remote and the pair cancels; one it only
   * deletes came from somewhere the remote knows about.
   */
  const readIntents = (mutations: readonly SyncMutation[]) => {
    const intents = new Map<string, 'upsert' | 'delete'>();
    const mutationIds = new Map<string, string[]>();
    const attribute = (id: string, mutationId: string) => {
      const ids = mutationIds.get(id);
      if (!ids) mutationIds.set(id, [mutationId]);
      else if (!ids.includes(mutationId)) ids.push(mutationId);
    };
    const createdHere = new Set<string>();
    const lastKnownValue = new Map<string, TRecord>();
    let touchesWholeCollection = false;
    const collectionWrites: string[] = [];

    for (const mutation of mutations) {
      for (const patch of mutation.patches) {
        const patchPath = normalizePatchPath(patch.path);
        const id = childKeyUnder(patchPath, path);
        if (id === undefined) {
          // A write at or above the collection changes records without naming
          // any of them; the ids have to come from a diff instead.
          if (reachesPath(patchPath, path)) {
            touchesWholeCollection = true;
            if (!collectionWrites.includes(mutation.id))
              collectionWrites.push(mutation.id);
          }
          continue;
        }
        const addressesRecord = patchPath.length === path.length + 1;
        attribute(id, mutation.id);
        if (patch.op === 'remove' && addressesRecord) {
          intents.set(id, 'delete');
          continue;
        }
        if (patch.op === 'add' && addressesRecord && !intents.has(id)) {
          createdHere.add(id);
        }
        intents.set(id, 'upsert');
      }
      // A removal's inverse carries the record that was removed, which is the
      // only copy left once the store no longer holds it.
      for (const patch of mutation.inversePatches) {
        const patchPath = normalizePatchPath(patch.path);
        const id = childKeyUnder(patchPath, path);
        if (
          id !== undefined &&
          patchPath.length === path.length + 1 &&
          patch.op === 'add' &&
          'value' in patch
        ) {
          lastKnownValue.set(id, (patch as { value: TRecord }).value);
          continue;
        }
        // A write at the collection itself has one inverse carrying every
        // record it replaced, which is the only copy of the ones it dropped.
        if (
          reachesPath(patchPath, path) &&
          patchPath.length === path.length &&
          'value' in patch
        ) {
          const previous = (patch as { value?: CrudCollection<TRecord> }).value;
          if (previous && typeof previous === 'object') {
            for (const [recordId, record] of Object.entries(previous)) {
              lastKnownValue.set(recordId, record as TRecord);
            }
          }
        }
      }
    }

    if (touchesWholeCollection) {
      const current = collection();
      for (const id of Object.keys(current)) {
        if (!intents.has(id)) intents.set(id, 'upsert');
        for (const mutation of collectionWrites) attribute(id, mutation);
      }
      // Everything the remote holds that the collection no longer does. The
      // baseline is durable, so this still names the right ids after a restart.
      for (const id of remoteIds) {
        if (!(id in current)) intents.set(id, 'delete');
        if (!(id in current))
          for (const mutation of collectionWrites) attribute(id, mutation);
      }
    }

    return { intents, createdHere, lastKnownValue, mutationIds };
  };

  return {
    bind(boundStore) {
      store = boundStore;
    },

    observeRemotePatches,

    // The baseline advances only when the store has taken the result. A pull
    // that turns out to be stale is discarded by the core, and advancing while
    // building it would have left this adapter ahead of the state it describes.
    accept: (result) => observeRemotePatches(result.patches),

    serialize: () => ({ remoteIds: [...remoteIds] }),

    hydrate(snapshot) {
      const ids = (snapshot as { remoteIds?: unknown } | undefined)?.remoteIds;
      if (!Array.isArray(ids)) return;
      for (const id of ids) {
        if (typeof id === 'string') remoteIds.add(id);
      }
    },

    async pull(context) {
      const result = asListResult(await list(context));
      const patches: NonNullable<Patches> = [];
      const seen = new Set<string>();

      for (const record of result.records) {
        const id = getId(record);
        seen.add(id);
        patches.push({
          op: 'replace',
          path: [...path, id],
          value: record
        } as NonNullable<Patches>[number]);
      }

      for (const id of result.deleted ?? []) {
        patches.push({
          op: 'remove',
          path: [...path, id]
        } as NonNullable<Patches>[number]);
      }

      if (authoritativeList) {
        for (const id of Object.keys(collection())) {
          if (seen.has(id)) continue;
          patches.push({
            op: 'remove',
            path: [...path, id]
          } as NonNullable<Patches>[number]);
        }
      }

      return {
        patches,
        cursor: result.cursor,
        revision: result.revision
      };
    },

    async push(mutations, _context): Promise<SyncPushResult> {
      const { intents, createdHere, lastKnownValue, mutationIds } =
        readIntents(mutations);
      const current = collection();
      // What the remote made of each write. A backend normalises, stamps a
      // timestamp, fills a default -- and the store would otherwise keep the
      // optimistic record until some later pull happened to correct it.
      const canonical: NonNullable<Patches> = [];
      const contextFor = (
        id: string,
        operation: CrudOperationContext['operation']
      ): CrudOperationContext => {
        const ids = mutationIds.get(id) ?? [];
        return {
          operation,
          recordId: id,
          mutationIds: ids,
          idempotencyKey: `${ids.join('.')}:${id}`
        };
      };
      for (const [id, intent] of intents) {
        const record = current[id];
        if (intent === 'delete' || record === undefined) {
          // Created and removed before either reached the remote: there is
          // nothing there to delete.
          // Created and removed before either reached the remote: there is
          // nothing there to delete.
          if (createdHere.has(id) && !remoteIds.has(id)) {
            forgetRemoteRecord(id);
            continue;
          }
          if (!remoteIds.has(id)) continue;
          if (!remove) throw new UnsupportedCrudOperationError('delete', id);
          const last = known.get(id) ?? lastKnownValue.get(id);
          await remove(last as TRecord, id, contextFor(id, 'delete'));
          forgetRemoteRecord(id);
          continue;
        }
        if (remoteIds.has(id)) {
          if (!update) throw new UnsupportedCrudOperationError('update', id);
          const returned = await update(record, contextFor(id, 'update'));
          seeRemoteRecord(id, (returned as TRecord) ?? record);
          if (returned) {
            canonical.push({
              op: 'replace',
              path: [...path, id],
              value: returned
            } as NonNullable<Patches>[number]);
          }
          continue;
        }
        if (!create) throw new UnsupportedCrudOperationError('create', id);
        try {
          const returned = await create(record, contextFor(id, 'create'));
          seeRemoteRecord(id, (returned as TRecord) ?? record);
          if (returned) {
            canonical.push({
              op: 'replace',
              path: [...path, id],
              value: returned
            } as NonNullable<Patches>[number]);
          }
        } catch (error) {
          onCreateError?.(error, record);
          throw error;
        }
      }
      // Returned as patches rather than written directly: they then take the
      // same path a pull's would -- one ordered lane, one atomic rebase over
      // whatever is still pending, one checkpoint.
      return canonical.length ? { patches: canonical } : {};
    }
  };
};
