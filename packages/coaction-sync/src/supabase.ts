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
  /** Schema the table lives in. Defaults to `public`. */
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
  const getId = (record: TRecord) =>
    String((record as Record<string, unknown>)[idColumn]);

  const crud = createCrudSyncAdapter<TRecord>({
    path,
    getId,
    // A full pull is paged to exhaustion below, so it really is the whole
    // table and omission really does mean the row is gone.
    authoritativeList: changesSince === undefined,
    list: async ({ cursor }) => {
      const position = decodeCursor(cursor);
      const records: TRecord[] = [];
      for (let page = 0; ; page += 1) {
        let query = client.from(table).select(select);
        if (changesSince !== undefined && position) {
          // Rows sharing the boundary timestamp are not skipped: the second
          // clause walks them by id, which is what makes the cursor total.
          query = query.or(
            `${changesSince}.gt.${position.value},and(${changesSince}.eq.${position.value},${idColumn}.gt.${position.id})`
          );
        }
        if (changesSince !== undefined) {
          query = query.order(changesSince, { ascending: true });
        }
        query = query
          .order(idColumn, { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        const data = unwrap<TRecord>(await query);
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        records.push(...rows);
        if (rows.length < pageSize) break;
        if (records.length > maxRecords) {
          throw new Error(
            `@coaction/sync: reading "${table}" passed ${maxRecords} rows. Set maxRecords higher, or pass changesSince so pulls are incremental.`
          );
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
        await client
          .from(table)
          .upsert(record, { onConflict: idColumn })
          .select(select)
          .single()
      );
      return (data as TRecord) ?? record;
    },
    update: async (record) => {
      const data = unwrap<TRecord>(
        await client
          .from(table)
          .update(record)
          .eq(idColumn, getId(record))
          .select(select)
          .single()
      );
      return (data as TRecord) ?? record;
    },
    delete: async (_record, id) => {
      unwrap(await client.from(table).delete().eq(idColumn, id));
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
