import type { SyncAdapter } from './index';
import {
  createCrudSyncAdapter,
  type CrudListResult,
  type CrudSyncAdapterOptions
} from './crud';

/**
 * The slice of `@tanstack/query-core`'s `QueryClient` this adapter uses.
 *
 * Typed structurally so the package is not a dependency: a real `QueryClient`
 * satisfies it.
 */
export type QueryClientLike = {
  fetchQuery<TData>(options: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<TData>;
    staleTime?: number;
  }): Promise<TData>;
  invalidateQueries(filters: { queryKey: readonly unknown[] }): Promise<void>;
  setQueryData<TData>(queryKey: readonly unknown[], data: TData): unknown;
};

export type QuerySyncAdapterOptions<TRecord extends object> = Omit<
  CrudSyncAdapterOptions<TRecord>,
  'list'
> & {
  queryClient: QueryClientLike;
  /** Cache key for the collection. */
  queryKey: readonly unknown[];
  /** Fetch records. Runs as the query function, so the cache owns retries. */
  list: (
    context: Parameters<CrudSyncAdapterOptions<TRecord>['list']>[0]
  ) => Promise<TRecord[] | CrudListResult<TRecord>>;
  /**
   * How long a cached result is reused before the next pull refetches.
   * Defaults to 0 — an explicit `sync.pull()` asks for fresh data.
   */
  staleTime?: number;
  /**
   * Invalidate `queryKey` after a push the remote accepted, so anything else
   * reading the same key refetches. Defaults to true.
   */
  invalidateOnPush?: boolean;
};

/**
 * Sync a keyed collection through a TanStack Query cache.
 *
 * The two own different halves of the problem and this connects them: the
 * query cache owns fetching — deduplication, retries, devtools, and any other
 * component reading the same key — while Coaction owns the optimistic local
 * state, the durable outbox, and the commit that carries a change to the
 * remote. A pull runs through `fetchQuery`, so a component already showing that
 * key sees the same data; a push writes through the CRUD calls and then
 * invalidates the key so those components refetch.
 *
 * ```ts
 * import { createQuerySyncAdapter } from '@coaction/sync/query';
 *
 * sync({
 *   name: 'todos',
 *   adapter: createQuerySyncAdapter<Todo>({
 *     queryClient,
 *     queryKey: ['todos'],
 *     path: ['todos'],
 *     list: () => api.listTodos(),
 *     create: (todo) => api.createTodo(todo),
 *     update: (todo) => api.updateTodo(todo),
 *     delete: (todo) => api.deleteTodo(todo.id)
 *   })
 * });
 * ```
 */
export const createQuerySyncAdapter = <TRecord extends object>({
  queryClient,
  queryKey,
  list,
  staleTime = 0,
  invalidateOnPush = true,
  ...crudOptions
}: QuerySyncAdapterOptions<TRecord>): SyncAdapter => {
  const crud = createCrudSyncAdapter<TRecord>({
    ...crudOptions,
    list: (context) =>
      queryClient.fetchQuery({
        // A cursor-paged endpoint returns a different page per cursor, so the
        // cursor belongs in the key rather than overwriting the first page.
        queryKey:
          context.cursor === undefined
            ? queryKey
            : [...queryKey, { cursor: context.cursor }],
        queryFn: () => Promise.resolve(list(context)),
        staleTime
      })
  });

  return {
    ...crud,
    async push(mutations, context) {
      const result = await crud.push(mutations, context);
      if (invalidateOnPush) {
        await queryClient.invalidateQueries({ queryKey });
      }
      return result;
    }
  };
};
