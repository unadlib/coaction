import { create } from 'coaction';
import {
  createFirestoreSyncAdapter,
  type FirestoreChange,
  type FirestoreOperations
} from '../src/firestore';
import { getSyncApi, sync, type SyncStorage } from '../src';

type Todo = { id: string; title: string; done: boolean };

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
 * A Firestore-shaped fake. The important detail it reproduces is that a
 * document's id lives on the document, never inside its data.
 */
const createFakeFirestore = (
  seed: Record<string, Record<string, unknown>> = {}
) => {
  const documents = new Map(Object.entries(seed));
  const writes: string[] = [];
  const reads: unknown[] = [];
  let emit: (changes: FirestoreChange[]) => void = () => undefined;
  let listenerClosed = false;

  const asDocument = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => ({ ...data })
  });

  const firestore: FirestoreOperations = {
    getDocs: async (reference) => {
      reads.push(reference);
      return {
        docs: [...documents.entries()].map(([id, data]) => asDocument(id, data))
      };
    },
    doc: (collection, id) => {
      // Firestore's doc() names a child of a CollectionReference. A Query has
      // no children, and passing one throws rather than writing anywhere.
      if ((collection as { __query?: boolean })?.__query) {
        throw new Error('doc() expects a CollectionReference, not a Query');
      }
      return { id };
    },
    setDoc: async (reference, data) => {
      const id = (reference as { id: string }).id;
      writes.push(`set:${id}`);
      documents.set(id, data as Record<string, unknown>);
    },
    deleteDoc: async (reference) => {
      const id = (reference as { id: string }).id;
      writes.push(`delete:${id}`);
      documents.delete(id);
    },
    onSnapshot: (_reference, next) => {
      emit = (changes) => next({ docChanges: () => changes });
      return () => {
        listenerClosed = true;
      };
    }
  };

  return {
    documents,
    writes,
    reads,
    firestore,
    isListenerClosed: () => listenerClosed,
    emitChanges: (
      changes: Array<
        [FirestoreChange['type'], string, Record<string, unknown>?]
      >
    ) =>
      emit(
        changes.map(([type, id, data]) => ({
          type,
          doc: asDocument(id, data ?? {})
        }))
      )
  };
};

const createTodoStore = (
  fake: ReturnType<typeof createFakeFirestore>,
  options: Partial<Parameters<typeof createFirestoreSyncAdapter>[0]> = {}
) =>
  create<{
    todos: Record<string, Todo>;
    add: (todo: Todo) => void;
    toggle: (id: string) => void;
    drop: (id: string) => void;
  }>(
    (set) => ({
      todos: {},
      add(todo) {
        set(() => {
          this.todos[todo.id] = todo;
        });
      },
      toggle(id) {
        set(() => {
          this.todos[id].done = !this.todos[id].done;
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
          name: 'firestore',
          storage: createMemoryStorage(),
          adapter: createFirestoreSyncAdapter<Todo>({
            firestore: fake.firestore,
            collection: { path: 'todos' },
            path: ['todos'],
            ...options
          })
        })
      ]
    }
  );

test('merges the document id into the record on read', async () => {
  const fake = createFakeFirestore({
    a: { title: 'first', done: false }
  });
  const store = createTodoStore(fake);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  // The stored document has no id field; the record does.
  expect(store.getState().todos.a).toEqual({
    id: 'a',
    title: 'first',
    done: false
  });
  store.destroy();
});

test('strips the id again on write, since Firestore keeps it as the key', async () => {
  const fake = createFakeFirestore();
  const store = createTodoStore(fake);
  await nextTick();

  store.getState().add({ id: 'a', title: 'draft', done: false });
  await nextTick();

  expect(fake.writes).toEqual(['set:a']);
  expect(fake.documents.get('a')).toEqual({ title: 'draft', done: false });
  expect(fake.documents.get('a')).not.toHaveProperty('id');
  store.destroy();
});

test('an edit writes the whole document, and a removal deletes it', async () => {
  const fake = createFakeFirestore({ a: { title: 'first', done: false } });
  const store = createTodoStore(fake);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  fake.writes.length = 0;

  store.getState().toggle('a');
  await nextTick();
  expect(fake.writes).toEqual(['set:a']);
  expect(fake.documents.get('a')).toEqual({ title: 'first', done: true });

  fake.writes.length = 0;
  store.getState().drop('a');
  await nextTick();
  expect(fake.writes).toEqual(['delete:a']);
  expect(fake.documents.has('a')).toBe(false);
  store.destroy();
});

test('a full read is authoritative and drops documents that are gone', async () => {
  const fake = createFakeFirestore({ a: { title: 'first', done: false } });
  const store = createTodoStore(fake);
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();
  expect(store.getState().todos.a).toBeDefined();

  fake.documents.delete('a');
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().todos.a).toBeUndefined();
  store.destroy();
});

test('a custom id field is honoured in both directions', async () => {
  const fake = createFakeFirestore({ k1: { label: 'one' } });
  const store = create<{
    rows: Record<string, { key: string; label: string }>;
  }>(() => ({ rows: {} }), {
    middlewares: [
      sync({
        name: 'firestore-key',
        storage: createMemoryStorage(),
        adapter: createFirestoreSyncAdapter<{ key: string; label: string }>({
          firestore: fake.firestore,
          collection: {},
          path: ['rows'],
          idField: 'key'
        })
      })
    ]
  });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  expect(store.getState().rows.k1).toEqual({ key: 'k1', label: 'one' });
  store.destroy();
});

test('a docChanges batch becomes one patch per change', async () => {
  const fake = createFakeFirestore();
  const store = createTodoStore(fake, { realtime: true });
  await nextTick();

  fake.emitChanges([
    ['added', 'a', { title: 'from firestore', done: false }],
    ['added', 'b', { title: 'second', done: true }]
  ]);
  await nextTick();
  expect(store.getState().todos.a.title).toBe('from firestore');
  expect(store.getState().todos.b.done).toBe(true);

  fake.emitChanges([['modified', 'a', { title: 'edited', done: false }]]);
  await nextTick();
  expect(store.getState().todos.a.title).toBe('edited');

  fake.emitChanges([['removed', 'a']]);
  await nextTick();
  expect(store.getState().todos.a).toBeUndefined();
  expect(store.getState().todos.b).toBeDefined();

  store.destroy();
  expect(fake.isListenerClosed()).toBe(true);
});

test('realtime needs onSnapshot to have been supplied', () => {
  const fake = createFakeFirestore();
  const adapter = createFirestoreSyncAdapter<Todo>({
    firestore: { ...fake.firestore, onSnapshot: undefined },
    collection: {},
    path: ['todos'],
    realtime: true
  });
  expect(() => adapter.subscribe?.(() => undefined)).toThrow(
    /needs onSnapshot/
  );
});

test('a narrowed read source is not used as the write address', async () => {
  const fake = createFakeFirestore({ a: { title: 'first', done: false } });
  const query = { __query: true };
  const store = createTodoStore(fake, { query });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  // The query is what gets read...
  expect(fake.reads).toEqual([query]);

  store.getState().toggle('a');
  await nextTick();

  // ...and the collection is what gets written, because doc() cannot name a
  // child of a query.
  expect(fake.writes).toEqual(['set:a']);
  expect(fake.documents.get('a')?.done).toBe(true);
  store.destroy();
});

test('a narrowed read is not treated as the whole collection', async () => {
  const fake = createFakeFirestore({ a: { title: 'first', done: false } });
  const store = createTodoStore(fake, { query: { __query: true } });
  await nextTick();
  await getSyncApi(store).pull();
  await nextTick();

  fake.documents.delete('a');
  await getSyncApi(store).pull();
  await nextTick();

  // A document the query excludes is absent from the answer, not deleted.
  expect(store.getState().todos.a).toBeDefined();
  store.destroy();
});

test('a document that arrived by realtime can be deleted remotely', async () => {
  const fake = createFakeFirestore();
  const store = createTodoStore(fake, { realtime: true });
  await nextTick();

  // No pull ever happened: the store learns about the document from the
  // snapshot listener alone.
  fake.emitChanges([['added', 'a', { title: 'first', done: false }]]);
  await nextTick();
  expect(store.getState().todos.a).toBeDefined();
  fake.writes.length = 0;

  store.getState().drop('a');
  await nextTick();

  // Without the baseline knowing the document exists, the delete is skipped
  // and the mutation acknowledged: gone locally, still there in Firestore.
  expect(fake.writes).toEqual(['delete:a']);
  expect(fake.documents.has('a')).toBe(false);
  store.destroy();
});
