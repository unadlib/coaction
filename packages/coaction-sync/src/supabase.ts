import type { SyncAdapter, SyncPullResult } from './index';
import { createCrudSyncAdapter } from './crud';

type Patches = SyncPullResult['patches'];

/** What a Postgrest call resolves to. */
export type SupabaseResult<TRecord> = {
  data: TRecord | TRecord[] | null;
  error: { message: string } | null;
};

/**
 * The slice of `@supabase/supabase-js` this adapter uses.
 *
 * Typed structurally so the package is not a dependency: pass a real
 * `SupabaseClient` and it satisfies this.
 */
export type SupabaseLikeClient = {
  from(table: string): SupabaseQueryBuilder;
  schema?(name: string): { from(table: string): SupabaseQueryBuilder };
  channel?(name: string): SupabaseChannel;
  removeChannel?(channel: SupabaseChannel): unknown;
};

export type SupabaseQueryBuilder = {
  select(columns?: string): SupabaseQueryBuilder;
  insert(values: unknown): SupabaseQueryBuilder;
  upsert(
    values: unknown,
    options?: { onConflict?: string }
  ): SupabaseQueryBuilder;
  update(values: unknown): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  gt(column: string, value: unknown): SupabaseQueryBuilder;
  or(filters: string): SupabaseQueryBuilder;
  range(from: number, to: number): SupabaseQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean }
  ): SupabaseQueryBuilder;
  single(): SupabaseQueryBuilder;
} & PromiseLike<SupabaseResult<any>>;

export type SupabaseChangePayload<TRecord> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: TRecord | null;
  old?: Partial<TRecord> | null;
};

export type SupabaseChannel = {
  on(
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string },
    handler: (payload: SupabaseChangePayload<any>) => void
  ): SupabaseChannel;
  subscribe(): SupabaseChannel;
  unsubscribe?(): unknown;
};

export type SupabaseSyncAdapterOptions = {
  client: SupabaseLikeClient;
  /** Table to read and write. */
  table: string;
  /** Where the keyed collection lives in the store, e.g. `['todos']`. */
  path: readonly PropertyKey[];
  /** Columns to select. Defaults to `*`. */
  select?: string;
  /** Primary key column. Defaults to `id`. */
  idColumn?: string;
  /**
   * Schema the table lives in. Defaults to `public`.
   *
   * Applies to reads, writes and the realtime filter alike. A non-default
   * schema needs a client exposing `schema()`, since `from()` alone resolves
   * against whatever the client was built with.
   */
  schema?: string;
  /**
   * Rows per request. PostgREST caps what one response may return, and a full
   * pull is paged to exhaustion rather than trusting a single response to be
   * the whole table. Defaults to 1000.
   */
  pageSize?: number;
  /**
   * Ceiling on a single full pull, as a guard against paging a table nobody
   * meant to synchronize whole. Exceeding it fails the pull -- returning a
   * partial set would let an authoritative list delete the rest. Defaults to
   * 100000.
   */
  maxRecords?: number;
  /**
   * Pull only rows changed since the last pull, using this column as the
   * cursor — `updated_at`, typically. A deleted row simply stops appearing, so
   * incremental pulls cannot report deletions; pair this with `realtime`, or
   * with a soft-delete column, if deletes have to propagate.
   */
  changesSince?: string;
  /** Subscribe to `postgres_changes` and apply them as they arrive. */
  realtime?: boolean;
  /** Channel name for the realtime subscription. Defaults to the table name. */
  channel?: string;
};

const unwrap = <TRecord>(result: SupabaseResult<TRecord>) => {
  if (result.error) {
    throw new Error(`Supabase: ${result.error.message}`);
  }
  return result.data;
};

/**
 * Sync a keyed collection with a Supabase table.
 *
 * Built on {@link createCrudSyncAdapter}: the patch-to-record translation and
 * the create/update/delete decisions live there, and this adds the Postgrest
 * calls, an optional changes-since cursor, and optional realtime.
 *
 * Writes are last-write-wins under replay. `create` upserts so a retry after a
 * crash cannot fail on the primary key, but a retry that succeeds still writes
 * the queued mutation's value over whatever is there. Pass your own handlers
 * built on `idempotencyKey` when concurrent editors need more than that -- see
 * "Delivery semantics" in the README.
 *
 * ```ts
 * sync({
 *   name: 'todos',
 *   adapter: createSupabaseSyncAdapter<Todo>({
 *     client: supabase,
 *     table: 'todos',
 *     path: ['todos'],
 *     changesSince: 'updated_at',
 *     realtime: true
 *   })
 * });
 * ```
 */
/**
 * A changes-since cursor names a row, not an instant.
 *
 * Many rows can share a timestamp, and `updated_at > cursor` steps straight
 * over the ones that share the last row's. The id breaks the tie. A cursor
 * written before this existed is a bare timestamp and still works.
 */
const cursorSeparator = '\u0000';
const encodeCursor = (value: string, id: string) =>
  `${value}${cursorSeparator}${id}`;
const decodeCursor = (cursor?: string) => {
  if (cursor === undefined) return undefined;
  const index = cursor.indexOf(cursorSeparator);
  return index === -1
    ? { value: cursor, id: '' }
    : { value: cursor.slice(0, index), id: cursor.slice(index + 1) };
};

export const createSupabaseSyncAdapter = <TRecord extends object>({
  client,
  table,
  path,
  select = '*',
  idColumn = 'id',
  schema = 'public',
  pageSize = 1000,
  maxRecords = 100_000,
  changesSince,
  realtime = false,
  channel: channelName
}: SupabaseSyncAdapterOptions): SyncAdapter => {
  if (schema !== 'public' && !client.schema) {
    throw new Error(
      `createSupabaseSyncAdapter({ schema: '${schema}' }) needs a client with schema(). Without it, reads and writes would go to the client's default schema while realtime watched "${schema}".`
    );
  }
  // `from()` resolves against the schema the client was built with, so naming
  // one has to route every read and write through it as well -- otherwise the
  // option moved only the realtime subscription.
  const from = (table: string) =>
    schema === 'public'
      ? client.from(table)
      : client.schema!(schema).from(table);

  const getId = (record: TRecord) =>
    String((record as Record<string, unknown>)[idColumn]);

  const crud = createCrudSyncAdapter<TRecord>({
    path,
    getId,
    // A full pull is paged to exhaustion below, so it really is the whole
    // table and omission really does mean the row is gone.
    authoritativeList: changesSince === undefined,
    list: async ({ cursor }) => {
      // Keyset paging, not offset. A row inserted or removed between two
      // requests shifts every offset after it, and a full pull is
      // authoritative -- a row skipped that way is read as deleted and removed
      // locally. Walking by key is stable under concurrent writes.
      let position = decodeCursor(cursor);
      let lastId: string | undefined;
      const records: TRecord[] = [];
      for (;;) {
        let query = from(table).select(select);
        if (changesSince !== undefined) {
          if (position) {
            // Rows sharing the boundary timestamp are not skipped: the second
            // clause walks them by id, which is what makes the cursor total.
            query = query.or(
              `${changesSince}.gt.${position.value},and(${changesSince}.eq.${position.value},${idColumn}.gt.${position.id})`
            );
          }
          query = query.order(changesSince, { ascending: true });
        } else if (lastId !== undefined) {
          query = query.gt(idColumn, lastId);
        }
        query = query
          .order(idColumn, { ascending: true })
          .range(0, pageSize - 1);
        const data = unwrap<TRecord>(await query);
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        records.push(...rows);
        // Before the break, not after: a run that ends on a short page would
        // otherwise return more than the ceiling allows without saying so,
        // which is the case the ceiling exists to catch.
        if (records.length > maxRecords) {
          throw new Error(
            `@coaction/sync: reading "${table}" passed ${maxRecords} rows. Set maxRecords higher, or pass changesSince so pulls are incremental.`
          );
        }
        if (rows.length < pageSize) break;
        const last = rows[rows.length - 1] as Record<string, unknown>;
        if (changesSince === undefined) {
          lastId = String(last[idColumn]);
        } else {
          position = {
            value: String(last[changesSince]),
            id: String(last[idColumn])
          };
        }
      }
      if (changesSince === undefined) {
        return { records };
      }
      // The rows are ordered, so the last one carries the newest position. An
      // empty response leaves the cursor where it was.
      const latest = records[records.length - 1] as
        | Record<string, unknown>
        | undefined;
      return {
        records,
        cursor:
          latest === undefined
            ? cursor
            : encodeCursor(
                String(latest[changesSince]),
                String(latest[idColumn])
              )
      };
    },
    create: async (record) => {
      // Upsert rather than insert: the window between the remote committing a
      // write and the acknowledgement being persisted is replayed on restart,
      // and an insert replayed against its own row is a primary key collision
      // rather than the write succeeding a second time.
      const data = unwrap<TRecord>(
        await from(table)
          .upsert(record, { onConflict: idColumn })
          .select(select)
          .single()
      );
      return (data as TRecord) ?? record;
    },
    update: async (record) => {
      const data = unwrap<TRecord>(
        await from(table)
          .update(record)
          .eq(idColumn, getId(record))
          .select(select)
          .single()
      );
      return (data as TRecord) ?? record;
    },
    delete: async (_record, id) => {
      unwrap(await from(table).delete().eq(idColumn, id));
    }
  });

  if (!realtime) {
    return crud;
  }

  return {
    ...crud,
    subscribe(listener) {
      if (!client.channel) {
        throw new Error(
          'createSupabaseSyncAdapter({ realtime: true }) needs a client with channel().'
        );
      }
      const channel = client
        .channel(channelName ?? `coaction-sync:${table}`)
        .on('postgres_changes', { event: '*', schema, table }, (payload) => {
          const patches: NonNullable<Patches> = [];
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as Record<string, unknown> | null)?.[
              idColumn
            ];
            if (id === undefined || id === null) return;
            patches.push({
              op: 'remove',
              path: [...path, String(id)]
            } as NonNullable<Patches>[number]);
          } else {
            const record = payload.new as TRecord | null;
            if (!record) return;
            patches.push({
              op: 'replace',
              path: [...path, getId(record)],
              value: record
            } as NonNullable<Patches>[number]);
          }
          listener({ patches });
        })
        .subscribe();

      return () => {
        channel.unsubscribe?.();
        client.removeChannel?.(channel);
      };
    }
  };
};
