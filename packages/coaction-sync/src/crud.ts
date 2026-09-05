import type { Store } from 'coaction';
import type {
  SyncAdapter,
  SyncMutation,
  SyncPullResult,
  SyncPushResult
} from './index';
import { childKeyUnder, normalizePatchPath, readAtPath } from './paths';

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
  create?: (record: TRecord) => Promise<TRecord | void>;
  update?: (record: TRecord) => Promise<TRecord | void>;
  /** Receives the last record known for the id, which may be stale. */
  delete?: (record: TRecord, id: string) => Promise<void>;
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
}: CrudSyncAdapterOptions<TRecord>): SyncAdapter => {
  let store: Store<any> | undefined;
  // What the remote is believed to hold. Decides create vs update, and gives
  // `delete` a record to work from once the store no longer has one.
  const known = new Map<string, TRecord>();

  const collection = (): CrudCollection<TRecord> =>
    (readAtPath(store?.getPureState(), path) as CrudCollection<TRecord>) ?? {};

  const touchedIds = (mutations: readonly SyncMutation[]) => {
    const ids = new Set<string>();
    for (const mutation of mutations) {
      for (const patch of mutation.patches) {
        const id = childKeyUnder(normalizePatchPath(patch.path), path);
        if (id !== undefined) ids.add(id);
      }
    }
    return ids;
  };

  return {
    bind(boundStore) {
      store = boundStore;
    },

    async pull(context) {
      const result = asListResult(await list(context));
      const patches: NonNullable<Patches> = [];
      const seen = new Set<string>();

      for (const record of result.records) {
        const id = getId(record);
        seen.add(id);
        known.set(id, record);
        patches.push({
          op: 'replace',
          path: [...path, id],
          value: record
        } as NonNullable<Patches>[number]);
      }

      for (const id of result.deleted ?? []) {
        known.delete(id);
        patches.push({
          op: 'remove',
          path: [...path, id]
        } as NonNullable<Patches>[number]);
      }

      if (authoritativeList) {
        for (const id of Object.keys(collection())) {
          if (seen.has(id)) continue;
          known.delete(id);
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
      const current = collection();
      for (const id of touchedIds(mutations)) {
        const record = current[id];
        if (record === undefined) {
          const last = known.get(id);
          // Never sent, already gone: nothing for the remote to delete.
          if (last === undefined) continue;
          if (remove) await remove(last, id);
          known.delete(id);
          continue;
        }
        if (known.has(id)) {
          if (update) {
            const returned = await update(record);
            known.set(id, (returned as TRecord) ?? record);
          }
          continue;
        }
        if (!create) continue;
        try {
          const returned = await create(record);
          known.set(id, (returned as TRecord) ?? record);
        } catch (error) {
          onCreateError?.(error, record);
          throw error;
        }
      }
      return {};
    }
  };
};
