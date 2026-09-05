import { create } from 'coaction';
import { createCrudSyncAdapter } from '../src/crud';
import { getSyncApi, sync, type SyncStorage } from '../src';

type Todo = { id: string; title: string; done: boolean };

const nextTick = async () => {
  for (let i = 0; i < 14; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createMemoryStorage = (): SyncStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    }
  };
};

/** A remote that records what it was asked to do. */
const createRemote = (seed: Todo[] = []) => {
  const records = new Map(seed.map((todo) => [todo.id, todo]));
  const calls: string[] = [];
  return {
    records,
    calls,
    list: async () => {
      calls.push('list');
      return [...records.values()];
    },
    create: async (todo: Todo) => {
      calls.push(`create:${todo.id}`);
      records.set(todo.id, todo);
      return todo;
    },
    update: async (todo: Todo) => {
      calls.push(`update:${todo.id}`);
      records.set(todo.id, todo);
      return todo;
    },
    delete: async (_todo: Todo, id: string) => {
      calls.push(`delete:${id}`);
      records.delete(id);
    }
  };
};

const createTodoStore = (
  remote: ReturnType<typeof createRemote>,
  options: Partial<Parameters<typeof createCrudSyncAdapter<Todo>>[0]> = {},
  storage = createMemoryStorage()
) => {
  const store = create<{
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
          name: 'crud',
          storage,
          adapter: createCrudSyncAdapter<Todo>({
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
  return { store, storage };
};

test('a pull turns records into patches at the collection path', async () => {
  const remote = createRemote([
    { id: 'a', title: 'first', done: false },
    { id: 'b', title: 'second', done: true }
  ]);
  const { store } = createTodoStore(remote);
  await nextTick();

  await getSyncApi(store).pull();
  await nextTick();

  expect(Object.keys(store.getState().todos)).toEqual(['a', 'b']);
  expect(store.getState().todos.a.title).toBe('first');
  expect(store.getState().todos.b.done).toBe(true);
  store.destroy();
});

test('a record the remote has never seen is created, and an edit updates it', async () => {
  const remote = createRemote();
  const { store } = createTodoStore(remote);
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft', done: false });
  await nextTick();
  expect(remote.calls).toContain('create:a');
  expect(remote.records.get('a')?.title).toBe('draft');

  remote.calls.length = 0;
  store.getState().rename('a', 'renamed');
  await nextTick();

  // Already sent once, so the second write is an update rather than a create.
  expect(remote.calls).toEqual(['update:a']);
  expect(remote.records.get('a')?.title).toBe('renamed');
  store.destroy();
});

test('removing a record from the store deletes it remotely', async () => {
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  const { store } = createTodoStore(remote);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  remote.calls.length = 0;
  store.getState().drop('a');
  await nextTick();

  expect(remote.calls).toEqual(['delete:a']);
  expect(remote.records.has('a')).toBe(false);
  store.destroy();
});

test('a record created and dropped before any push asks the remote for nothing', async () => {
  const remote = createRemote();
  const { store } = createTodoStore(remote, {
    // Hold the push so both commits land in one flush.
    create: () => new Promise<never>(() => undefined)
  });
  await nextTick();

  store.getState().add({ id: 'ghost', title: 'typo', done: false });
  store.getState().drop('ghost');
  await nextTick();

  expect(remote.calls.filter((call) => call !== 'list')).toEqual([]);
  store.destroy();
});

test('an authoritative list removes records it omits', async () => {
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  const { store } = createTodoStore(remote, { authoritativeList: true });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(Object.keys(store.getState().todos)).toEqual(['a']);

  remote.records.delete('a');
  await getSyncApi(store).pull();
  await nextTick();

  expect(Object.keys(store.getState().todos)).toEqual([]);
  store.destroy();
});

test('without an authoritative list an omitted record is left alone', async () => {
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  const { store } = createTodoStore(remote);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  remote.records.delete('a');
  await getSyncApi(store).pull();
  await nextTick();

  // A page that does not mention a record is not a statement that it is gone.
  expect(Object.keys(store.getState().todos)).toEqual(['a']);
  store.destroy();
});

test('an incremental response can report deletions explicitly', async () => {
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  let deleted: string[] = [];
  const { store } = createTodoStore(remote, {
    list: async () => ({ records: [...remote.records.values()], deleted })
  });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(store.getState().todos.a).toBeDefined();

  remote.records.delete('a');
  deleted = ['a'];
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a).toBeUndefined();
  store.destroy();
});

test('a cursor from the list response is carried back to the next call', async () => {
  const seen: Array<string | undefined> = [];
  const remote = createRemote();
  const { store, storage } = createTodoStore(remote, {
    list: async (context) => {
      seen.push(context.cursor);
      return { records: [], cursor: 'page-2' };
    }
  });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  expect(seen).toEqual([undefined, 'page-2']);
  expect(JSON.parse(storage.map.get('crud')!).cursor).toBe('page-2');
  store.destroy();
});

test('a failed write keeps the mutation and reports the failure', async () => {
  const errors: unknown[] = [];
  const remote = createRemote();
  const store = create<{
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
          name: 'crud-fail',
          storage: createMemoryStorage(),
          onError: (error) => errors.push(error),
          adapter: createCrudSyncAdapter<Todo>({
            path: ['todos'],
            list: remote.list,
            create: async () => {
              throw new Error('remote rejected');
            }
          })
        })
      ]
    }
  );
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft', done: false });
  await nextTick();

  expect((errors[0] as Error).message).toBe('remote rejected');
  expect(getSyncApi(store).getPending()).toHaveLength(1);
  expect(store.getState().todos.a.title).toBe('draft');
  store.destroy();
});

test('a custom key reader replaces the default id field', async () => {
  type Row = { key: string; label: string };
  const rows = new Map<string, Row>([['k1', { key: 'k1', label: 'one' }]]);
  const store = create<{ rows: Record<string, Row> }>(() => ({ rows: {} }), {
    middlewares: [
      sync({
        name: 'crud-key',
        storage: createMemoryStorage(),
        adapter: createCrudSyncAdapter<Row>({
          path: ['rows'],
          getId: (row) => row.key,
          list: async () => [...rows.values()]
        })
      })
    ]
  });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().rows.k1.label).toBe('one');
  store.destroy();
});
