import { QueryClient } from '@tanstack/query-core';
import { create } from 'coaction';
import { createQuerySyncAdapter } from '../src/query';
import { getSyncApi, sync, type SyncStorage } from '../src';

type Todo = { id: string; title: string };

const nextTick = async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createMemoryStorage = (): SyncStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

const createRemote = (seed: Todo[] = []) => {
  const rows = new Map(seed.map((row) => [row.id, row]));
  let fetches = 0;
  return {
    rows,
    fetches: () => fetches,
    list: async () => {
      fetches += 1;
      return [...rows.values()];
    },
    create: async (todo: Todo) => {
      rows.set(todo.id, todo);
      return todo;
    },
    update: async (todo: Todo) => {
      rows.set(todo.id, todo);
      return todo;
    },
    delete: async (_todo: Todo, id: string) => {
      rows.delete(id);
    }
  };
};

const createTodoStore = (
  queryClient: QueryClient,
  remote: ReturnType<typeof createRemote>,
  options: Partial<Parameters<typeof createQuerySyncAdapter<Todo>>[0]> = {}
) =>
  create<{
    todos: Record<string, Todo>;
    add: (todo: Todo) => void;
  }>(
    (set) => ({
      todos: {},
      add(todo) {
        set(() => {
          this.todos[todo.id] = todo;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'query',
          storage: createMemoryStorage(),
          adapter: createQuerySyncAdapter<Todo>({
            queryClient: queryClient as never,
            queryKey: ['todos'],
            path: ['todos'],
            list: remote.list,
            create: remote.create,
            update: remote.update,
            delete: remote.delete,
            ...options
          })
        })
      ]
    }
  );

test('a pull fills the store and populates the query cache', async () => {
  const queryClient = new QueryClient();
  const remote = createRemote([{ id: 'a', title: 'first' }]);
  const store = createTodoStore(queryClient, remote);
  await nextTick();

  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a.title).toBe('first');
  // The same key now serves any component reading it, without a second request.
  expect(queryClient.getQueryData(['todos'])).toEqual([
    { id: 'a', title: 'first' }
  ]);
  store.destroy();
  queryClient.clear();
});

test('a fresh cache entry is reused instead of refetched', async () => {
  const queryClient = new QueryClient();
  const remote = createRemote([{ id: 'a', title: 'first' }]);
  const store = createTodoStore(queryClient, remote, { staleTime: 60_000 });
  await nextTick();

  await getSyncApi(store).pull();
  await getSyncApi(store).pull();
  await nextTick();

  expect(remote.fetches()).toBe(1);
  store.destroy();
  queryClient.clear();
});

test('with the default staleTime each pull asks for fresh data', async () => {
  const queryClient = new QueryClient();
  const remote = createRemote([{ id: 'a', title: 'first' }]);
  const store = createTodoStore(queryClient, remote);
  await nextTick();

  await getSyncApi(store).pull();
  await getSyncApi(store).pull();
  await nextTick();

  expect(remote.fetches()).toBe(2);
  store.destroy();
  queryClient.clear();
});

test('a push writes through and then invalidates the key', async () => {
  const queryClient = new QueryClient();
  const remote = createRemote();
  const store = createTodoStore(queryClient, remote);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(queryClient.getQueryState(['todos'])?.isInvalidated).toBe(false);

  store.getState().add({ id: 'a', title: 'draft' });
  await nextTick();

  expect(remote.rows.get('a')?.title).toBe('draft');
  // Anything else reading this key now knows to refetch.
  expect(queryClient.getQueryState(['todos'])?.isInvalidated).toBe(true);
  store.destroy();
  queryClient.clear();
});

test('invalidation can be turned off for a write-behind cache', async () => {
  const queryClient = new QueryClient();
  const remote = createRemote();
  const store = createTodoStore(queryClient, remote, {
    invalidateOnPush: false
  });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft' });
  await nextTick();

  expect(remote.rows.get('a')?.title).toBe('draft');
  expect(queryClient.getQueryState(['todos'])?.isInvalidated).toBe(false);
  store.destroy();
  queryClient.clear();
});

test('a paged pull caches each cursor separately', async () => {
  const queryClient = new QueryClient();
  const pages: Record<string, Todo[]> = {
    first: [{ id: 'a', title: 'page one' }],
    'page-2': [{ id: 'b', title: 'page two' }]
  };
  const remote = createRemote();
  const store = createTodoStore(queryClient, remote, {
    staleTime: 60_000,
    list: async ({ cursor }) => ({
      records: pages[cursor ?? 'first'] ?? [],
      cursor: cursor === undefined ? 'page-2' : cursor
    })
  });
  await nextTick();

  await getSyncApi(store).pull();
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a.title).toBe('page one');
  expect(store.getState().todos.b.title).toBe('page two');
  // A cursor would otherwise overwrite the first page under the same key.
  expect(queryClient.getQueryData(['todos'])).toBeDefined();
  expect(
    queryClient.getQueryData(['todos', { cursor: 'page-2' }])
  ).toBeDefined();
  store.destroy();
  queryClient.clear();
});

test('a failed fetch surfaces through sync rather than being swallowed', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const errors: unknown[] = [];
  const store = create<{ todos: Record<string, Todo> }>(() => ({ todos: {} }), {
    middlewares: [
      sync({
        name: 'query-error',
        storage: createMemoryStorage(),
        onError: (error) => errors.push(error),
        adapter: createQuerySyncAdapter<Todo>({
          queryClient: queryClient as never,
          queryKey: ['todos'],
          path: ['todos'],
          list: async () => {
            throw new Error('network down');
          }
        })
      })
    ]
  });
  await nextTick();

  await expect(getSyncApi(store).pull()).rejects.toThrow('network down');
  expect((errors[0] as Error).message).toBe('network down');
  store.destroy();
  queryClient.clear();
});
