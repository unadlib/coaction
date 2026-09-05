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

test('replacing the whole collection is diffed rather than silently accepted', async () => {
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  const { store } = createTodoStore(remote);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  remote.calls.length = 0;

  // A write at the collection itself names no record ids at all.
  store.setState({ todos: { b: { id: 'b', title: 'second', done: false } } });
  await nextTick();

  expect(remote.calls).toContain('create:b');
  expect(remote.calls).toContain('delete:a');
  expect(remote.records.has('a')).toBe(false);
  expect(remote.records.get('b')?.title).toBe('second');
  store.destroy();
});

test('a pending delete still reaches the remote after a restart', async () => {
  const storage = createMemoryStorage();
  const remote = createRemote([{ id: 'a', title: 'first', done: false }]);
  const held = () => new Promise<never>(() => undefined);

  // First run: the record is pulled, then deleted, and the delete is held so it
  // stays in the durable outbox when the process goes away.
  const first = createTodoStore(remote, { delete: held }, storage).store;
  await nextTick();
  await getSyncApi(first).pull();
  await nextTick();
  first.getState().drop('a');
  await nextTick();
  expect(getSyncApi(first).getPending()).toHaveLength(1);
  first.destroy();

  // Second run: `known` is empty and the record is already gone from the
  // restored state, so the intent has to come from the queued mutation.
  remote.calls.length = 0;
  const restarted = createTodoStore(remote, {}, storage).store;
  await nextTick();

  expect(remote.calls).toContain('delete:a');
  expect(remote.records.has('a')).toBe(false);
  expect(getSyncApi(restarted).getPending()).toHaveLength(0);
  restarted.destroy();
});

test('after a restart an edit to a pulled record updates it rather than creating it', async () => {
  const storage = createMemoryStorage();
  const remote = createRemote([{ id: 'a', title: 'old', done: false }]);
  const first = createTodoStore(remote, {}, storage).store;
  await nextTick();
  await getSyncApi(first).pull();
  await nextTick();
  first.destroy();

  // Second run: the record came from a pull in a previous process, so nothing
  // in this one's memory has ever seen it.
  remote.calls.length = 0;
  const restarted = createTodoStore(remote, {}, storage).store;
  await nextTick();
  restarted.getState().rename('a', 'new');
  await nextTick();

  expect(remote.calls).toEqual(['update:a']);
  expect(remote.records.get('a')?.title).toBe('new');
  restarted.destroy();
});

test('after a restart replacing the whole collection still deletes remotely', async () => {
  const storage = createMemoryStorage();
  const remote = createRemote([{ id: 'a', title: 'old', done: false }]);
  const first = createTodoStore(remote, {}, storage).store;
  await nextTick();
  await getSyncApi(first).pull();
  await nextTick();
  first.destroy();

  remote.calls.length = 0;
  const restarted = createTodoStore(remote, {}, storage).store;
  await nextTick();
  // A write at the collection names no ids at all, and after a restart there
  // is no in-memory record of what the remote held.
  restarted.setState({ todos: {} });
  await nextTick();

  expect(remote.calls).toContain('delete:a');
  expect(remote.records.has('a')).toBe(false);
  expect(getSyncApi(restarted).getPending()).toHaveLength(0);
  restarted.destroy();
});

test('a record that arrived by realtime is updated, not created', async () => {
  const remote = createRemote();
  const storage = createMemoryStorage();
  let emit: ((update: { patches: any }) => void) | undefined;
  const base = createCrudSyncAdapter<Todo>({
    path: ['todos'],
    list: remote.list,
    create: remote.create,
    update: remote.update,
    delete: remote.delete
  });
  const store = create<{
    todos: Record<string, Todo>;
    rename: (id: string, title: string) => void;
  }>(
    (set) => ({
      todos: {},
      rename(id, title) {
        set(() => {
          this.todos[id].title = title;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'crud-realtime',
          storage,
          adapter: {
            ...base,
            subscribe(listener) {
              emit = (update) => {
                base.observeRemotePatches(update.patches);
                listener(update as any);
              };
            }
          }
        })
      ]
    }
  );
  await nextTick();

  // The remote already holds it; the store learns through the subscription.
  remote.records.set('a', { id: 'a', title: 'from server', done: false });
  emit!({
    patches: [
      {
        op: 'replace',
        path: ['todos', 'a'],
        value: { id: 'a', title: 'from server', done: false }
      }
    ]
  });
  await nextTick();
  remote.calls.length = 0;

  store.getState().rename('a', 'edited');
  await nextTick();

  expect(remote.calls).toEqual(['update:a']);
  store.destroy();
});

test('a mutation needing a handler the adapter lacks is not acknowledged', async () => {
  const errors: unknown[] = [];
  const remote = createRemote([{ id: 'a', title: 'old', done: false }]);
  const storage = createMemoryStorage();
  const store = create<{
    todos: Record<string, Todo>;
    rename: (id: string, title: string) => void;
  }>(
    (set) => ({
      todos: {},
      rename(id, title) {
        set(() => {
          this.todos[id].title = title;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'crud-no-update',
          storage,
          onError: (error) => errors.push(error),
          adapter: createCrudSyncAdapter<Todo>({
            path: ['todos'],
            list: remote.list
            // No update handler.
          })
        })
      ]
    }
  );
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  store.getState().rename('a', 'new');
  await nextTick();

  // Silently skipping the write would acknowledge the mutation and drop it.
  expect(remote.records.get('a')?.title).toBe('old');
  expect(getSyncApi(store).getPending()).toHaveLength(1);
  expect((errors[0] as Error).name).toBe('UnsupportedCrudOperationError');
  expect((errors[0] as Error).message).toMatch(/no "update" handler/);
  store.destroy();
});

test('a removal from a narrowed read does not forget the record exists', async () => {
  const remote = createRemote();
  const adapter = createCrudSyncAdapter<Todo>({
    path: ['todos'],
    list: remote.list,
    create: remote.create,
    update: remote.update,
    delete: remote.delete
  });
  const store = create<{
    todos: Record<string, Todo>;
    put: (todo: Todo) => void;
  }>(
    (set) => ({
      todos: {},
      put(todo) {
        set(() => {
          this.todos[todo.id] = todo;
        });
      }
    }),
    {
      middlewares: [
        sync({ name: 'crud-narrow', storage: createMemoryStorage(), adapter })
      ]
    }
  );
  await nextTick();

  const record = { id: 'a', title: 'from server', done: false };
  remote.records.set('a', record);
  adapter.observeRemotePatches([
    { op: 'replace', path: ['todos', 'a'], value: record }
  ] as never);
  // The record leaves the query without leaving the remote.
  adapter.observeRemotePatches(
    [{ op: 'remove', path: ['todos', 'a'] }] as never,
    {
      removalMeansGone: false
    }
  );
  remote.calls.length = 0;

  store.getState().put({ id: 'a', title: 'edited', done: false });
  await nextTick();

  expect(remote.calls).toEqual(['update:a']);
  store.destroy();
});

test('handlers receive the queued mutations a write carries', async () => {
  const seen: Array<{ key: string; ids: readonly string[]; op: string }> = [];
  const remote = createRemote();
  const store = create<{
    todos: Record<string, Todo>;
    add: (todo: Todo) => void;
    rename: (id: string, title: string) => void;
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
      }
    }),
    {
      middlewares: [
        sync({
          name: 'crud-context',
          storage: createMemoryStorage(),
          adapter: createCrudSyncAdapter<Todo>({
            path: ['todos'],
            list: remote.list,
            create: async (record, context) => {
              seen.push({
                key: context.idempotencyKey,
                ids: context.mutationIds,
                op: context.operation
              });
              return remote.create(record);
            },
            update: async (record, context) => {
              seen.push({
                key: context.idempotencyKey,
                ids: context.mutationIds,
                op: context.operation
              });
              return remote.update(record);
            }
          })
        })
      ]
    }
  );
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft', done: false });
  await nextTick();
  store.getState().rename('a', 'renamed');
  await nextTick();

  expect(seen.map(({ op }) => op)).toEqual(['create', 'update']);
  // Each write names the queued mutation it carries, so a remote that dedupes
  // on the key survives a retry after a crash.
  expect(seen[0].ids).toHaveLength(1);
  expect(seen[0].key).toBe(`${seen[0].ids[0]}:create:a`);
  expect(seen[1].key).toBe(`${seen[1].ids[0]}:update:a`);
  expect(seen[0].ids[0]).not.toBe(seen[1].ids[0]);
  store.destroy();
});

test('a pull discarded as stale does not advance what the remote is believed to hold', async () => {
  const remote = createRemote([{ id: 'a', title: 'from server', done: false }]);
  let listCalls = 0;
  let releaseFirst!: () => void;
  let emit: ((update: { patches: unknown }) => void) | undefined;
  const base = createCrudSyncAdapter<Todo>({
    path: ['todos'],
    list: async () => {
      listCalls += 1;
      if (listCalls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return [...remote.records.values()];
      }
      // By the time the store asks again, the row is gone.
      return [];
    },
    create: remote.create,
    update: remote.update,
    delete: remote.delete
  });
  const store = create<{
    todos: Record<string, Todo>;
    put: (todo: Todo) => void;
  }>(
    (set) => ({
      todos: {},
      put(todo) {
        set(() => {
          this.todos[todo.id] = todo;
        });
      }
    }),
    {
      middlewares: [
        sync({
          name: 'crud-stale',
          storage: createMemoryStorage(),
          adapter: {
            ...base,
            subscribe(listener) {
              emit = listener as never;
            }
          }
        })
      ]
    }
  );
  await nextTick();

  const pulled = getSyncApi(store).pull();
  await nextTick();
  // Something else moves the remote state while the pull is out, so its answer
  // describes a base that is gone and the core discards it.
  emit!({ patches: [{ op: 'replace', path: ['todos'], value: {} }] });
  await nextTick();
  releaseFirst();
  await pulled;
  await nextTick();
  remote.calls.length = 0;

  store.getState().put({ id: 'a', title: 'mine', done: false });
  await nextTick();

  // The discarded pull must not have taught the adapter that the remote holds
  // "a": believing it would send this as an update of a row that is not there.
  expect(remote.calls).toEqual(['create:a']);
  store.destroy();
});
