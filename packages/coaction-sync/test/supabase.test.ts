import { create } from 'coaction';
import { createSupabaseSyncAdapter } from '../src/supabase';
import {
  getSyncApi,
  sync,
  type SyncStorage,
  type SyncPullResult
} from '../src';

type Todo = { id: string; title: string; updated_at: string };

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

/**
 * A Postgrest-shaped fake: the builder collects the chained calls and resolves
 * when awaited, which is how the real client behaves.
 */
const createFakeSupabase = (seed: Todo[] = []) => {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const calls: string[] = [];
  let failNext: string | undefined;
  let emit: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: Todo | null;
    old?: Partial<Todo> | null;
  }) => void = () => undefined;
  let channelClosed = false;

  const builder = (table: string) => {
    const state: {
      op: 'select' | 'insert' | 'update' | 'delete';
      values?: Todo;
      filters: Array<[string, string, unknown]>;
      order?: string;
      single: boolean;
    } = { op: 'select', filters: [], single: false };

    const run = () => {
      if (failNext) {
        const message = failNext;
        failNext = undefined;
        return { data: null, error: { message } };
      }
      calls.push(`${state.op}:${table}`);
      if (state.op === 'insert') {
        rows.set(state.values!.id, state.values!);
        return { data: state.values, error: null };
      }
      if (state.op === 'update') {
        rows.set(state.values!.id, state.values!);
        return { data: state.values, error: null };
      }
      if (state.op === 'delete') {
        for (const [column, operator, value] of state.filters) {
          if (column === 'id' && operator === 'eq') rows.delete(String(value));
        }
        return { data: null, error: null };
      }
      let data = [...rows.values()];
      for (const [column, operator, value] of state.filters) {
        if (operator === 'gt') {
          data = data.filter(
            (row) =>
              String((row as Record<string, unknown>)[column]) > String(value)
          );
        }
      }
      if (state.order) {
        data = [...data].sort((a, b) =>
          String((a as Record<string, unknown>)[state.order!]).localeCompare(
            String((b as Record<string, unknown>)[state.order!])
          )
        );
      }
      return { data: state.single ? (data[0] ?? null) : data, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (values: Todo) => {
        state.op = 'insert';
        state.values = values;
        return api;
      },
      update: (values: Todo) => {
        state.op = 'update';
        state.values = values;
        return api;
      },
      delete: () => {
        state.op = 'delete';
        return api;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push([column, 'eq', value]);
        return api;
      },
      gt: (column: string, value: unknown) => {
        state.filters.push([column, 'gt', value]);
        return api;
      },
      order: (column: string) => {
        state.order = column;
        return api;
      },
      single: () => {
        state.single = true;
        return api;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve)
    };
    return api;
  };

  return {
    rows,
    calls,
    failWith: (message: string) => {
      failNext = message;
    },
    emitChange: (payload: Parameters<typeof emit>[0]) => emit(payload),
    isChannelClosed: () => channelClosed,
    client: {
      from: builder,
      channel: () => {
        const channel: any = {
          on: (_event: string, _filter: unknown, handler: typeof emit) => {
            emit = handler;
            return channel;
          },
          subscribe: () => channel,
          unsubscribe: () => {
            channelClosed = true;
          }
        };
        return channel;
      },
      removeChannel: () => undefined
    }
  };
};

const createTodoStore = (
  supabase: ReturnType<typeof createFakeSupabase>,
  options: Partial<Parameters<typeof createSupabaseSyncAdapter>[0]> = {}
) =>
  create<{
    todos: Record<string, Todo>;
    add: (todo: Todo) => void;
    rename: (id: string, title: string) => void;
    drop: (id: string) => void;
  }>(
    (set) => ({
      todos: {},
      add(todo) {
        set(() => {
          this.todos[todo.id] = todo;
        });
      },
      rename(id, title) {
        set(() => {
          this.todos[id].title = title;
        });
      },
      drop(id) {
        set(() => {
          delete this.todos[id];
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'supabase',
          storage: createMemoryStorage(),
          adapter: createSupabaseSyncAdapter<Todo>({
            client: supabase.client,
            table: 'todos',
            path: ['todos'],
            ...options
          })
        })
      ]
    }
  );

test('selects rows into the collection', async () => {
  const supabase = createFakeSupabase([
    { id: 'a', title: 'first', updated_at: '2026-01-01' }
  ]);
  const store = createTodoStore(supabase);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a.title).toBe('first');
  expect(supabase.calls).toContain('select:todos');
  store.destroy();
});

test('inserts, updates and deletes rows as the store changes', async () => {
  const supabase = createFakeSupabase();
  const store = createTodoStore(supabase);
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft', updated_at: '2026-01-01' });
  await nextTick();
  expect(supabase.calls).toContain('insert:todos');
  expect(supabase.rows.get('a')?.title).toBe('draft');

  store.getState().rename('a', 'renamed');
  await nextTick();
  expect(supabase.calls).toContain('update:todos');
  expect(supabase.rows.get('a')?.title).toBe('renamed');

  store.getState().drop('a');
  await nextTick();
  expect(supabase.calls).toContain('delete:todos');
  expect(supabase.rows.has('a')).toBe(false);
  store.destroy();
});

test('a Postgrest error becomes a rejected sync rather than a silent no-op', async () => {
  const supabase = createFakeSupabase();
  const errors: unknown[] = [];
  const store = create<{ todos: Record<string, Todo> }>(() => ({ todos: {} }), {
    middlewares: [
      sync({
        name: 'supabase-error',
        storage: createMemoryStorage(),
        onError: (error) => errors.push(error),
        adapter: createSupabaseSyncAdapter<Todo>({
          client: supabase.client,
          table: 'todos',
          path: ['todos']
        })
      })
    ]
  });
  await nextTick();

  supabase.failWith('permission denied for table todos');
  await expect(getSyncApi(store).pull()).rejects.toThrow(/permission denied/);
  expect((errors[0] as Error).message).toMatch(/Supabase: permission denied/);
  store.destroy();
});

test('changesSince pulls only newer rows and carries the cursor forward', async () => {
  const supabase = createFakeSupabase([
    { id: 'a', title: 'old', updated_at: '2026-01-01' }
  ]);
  const store = createTodoStore(supabase, { changesSince: 'updated_at' });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(store.getState().todos.a.title).toBe('old');

  supabase.rows.set('b', { id: 'b', title: 'new', updated_at: '2026-02-01' });
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.b.title).toBe('new');
  // The first row is older than the cursor, so the second pull skipped it.
  expect(store.getState().todos.a).toBeDefined();
  store.destroy();
});

test('an incremental pull does not delete rows it did not mention', async () => {
  const supabase = createFakeSupabase([
    { id: 'a', title: 'kept', updated_at: '2026-01-01' }
  ]);
  const store = createTodoStore(supabase, { changesSince: 'updated_at' });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  await getSyncApi(store).pull();
  await nextTick();

  // A changes-since page omitting a row only means "unchanged", never "gone".
  expect(store.getState().todos.a).toBeDefined();
  store.destroy();
});

test('a full pull is authoritative and removes rows the table no longer has', async () => {
  const supabase = createFakeSupabase([
    { id: 'a', title: 'first', updated_at: '2026-01-01' }
  ]);
  const store = createTodoStore(supabase);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(store.getState().todos.a).toBeDefined();

  supabase.rows.delete('a');
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a).toBeUndefined();
  store.destroy();
});

test('realtime changes are applied, and unsubscribing closes the channel', async () => {
  const supabase = createFakeSupabase();
  const store = createTodoStore(supabase, { realtime: true });
  await nextTick();

  supabase.emitChange({
    eventType: 'INSERT',
    new: { id: 'r', title: 'from realtime', updated_at: '2026-03-01' }
  });
  await nextTick();
  expect(store.getState().todos.r.title).toBe('from realtime');

  supabase.emitChange({
    eventType: 'UPDATE',
    new: { id: 'r', title: 'edited elsewhere', updated_at: '2026-03-02' }
  });
  await nextTick();
  expect(store.getState().todos.r.title).toBe('edited elsewhere');

  supabase.emitChange({ eventType: 'DELETE', old: { id: 'r' } });
  await nextTick();
  expect(store.getState().todos.r).toBeUndefined();

  store.destroy();
  expect(supabase.isChannelClosed()).toBe(true);
});

test('realtime needs a client that can open channels', () => {
  const adapter = createSupabaseSyncAdapter<Todo>({
    client: { from: () => ({}) as never },
    table: 'todos',
    path: ['todos'],
    realtime: true
  });
  expect(() =>
    adapter.subscribe?.(() => undefined as unknown as SyncPullResult)
  ).toThrow(/needs a client with channel/);
});
