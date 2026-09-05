# @coaction/sync

Commit-based local-first synchronization for Coaction.

```ts
import { create } from 'coaction';
import { sync } from '@coaction/sync';

const store = create(
  (set) => ({
    todos: [],
    add(todo) {
      set(() => void this.todos.push(todo));
    }
  }),
  {
    middlewares: [
      sync({
        name: 'todos-sync',
        adapter: {
          pull: async ({ cursor }) => fetchChanges(cursor),
          push: async (mutations) => pushMutations(mutations)
        }
      })
    ]
  }
);
```

Local commits are persisted to a durable outbox before network delivery. Pulls
rebase pending optimistic commits over remote patches. Remote implementations
should treat mutation `id` values idempotently so retry after a crash is safe.

## Backends

Each adapter is its own entry, so a store only bundles the one it uses.

| Import                     | Backend                                                            |
| :------------------------- | :----------------------------------------------------------------- |
| `@coaction/sync`           | `createFetchSyncAdapter` — JSON over HTTP                          |
| `@coaction/sync/crud`      | Any list/create/update/delete API. The base the rest are built on. |
| `@coaction/sync/supabase`  | Postgres table, with an optional changes-since cursor and realtime |
| `@coaction/sync/firestore` | Firestore collection or query, with optional `onSnapshot`          |
| `@coaction/sync/query`     | A TanStack Query cache in front of any of the above                |
| `@coaction/sync/indexeddb` | Durable storage past what `localStorage` holds                     |

Nothing here is a dependency of this package. Each client is typed structurally
against the slice actually used, so a real `SupabaseClient` or `QueryClient`
satisfies it and none of them are installed for a store that does not use them.

Two things need no adapter at all. `SyncStorage` is `getItem`/`setItem`/
`removeItem`, sync or async — the shape `localStorage` and React Native's
`AsyncStorage` already have, so both can be passed directly. And a backend that
does not fit any of the above is a `SyncAdapter`: two methods, `pull` and
`push`.

## Conflict policies and durable state

`sync()` persists the optimistic state snapshot and the mutation outbox by
default, to `localStorage`. A runtime without one — a Worker, Node, an SSR
render — is refused rather than quietly running with a memory-only outbox; pass
a `storage` of your own, or `storage: false` to say the outbox need not survive
the process. Pending commits that happen while asynchronous storage hydration is still running are rebased over the durable snapshot instead of being overwritten.

```ts
sync({
  name: 'todos-sync',
  adapter,
  conflict: 'remote-wins' // or 'local-wins' (default) / custom resolver
});
```

A custom conflict resolver is invoked only when local and remote patch paths overlap.

A pending mutation can also become impossible to replay — the remote deleted the
object an optimistic edit lives inside, for example. Such a mutation is dropped
and reported through `onError`, so the client converges on the remote state
instead of retrying a rebase that can never succeed. Handle it if you need to
tell the user their edit was lost. Rebase recomputes inverse patches against the new remote base using path-local values rather than cloning the whole store.

## HTTP adapter

For JSON-over-HTTP backends, `createFetchSyncAdapter()` provides a minimal GET pull / POST push adapter:

```ts
import { createFetchSyncAdapter } from '@coaction/sync';

const adapter = createFetchSyncAdapter({
  url: '/api/sync',
  headers: () => ({ authorization: `Bearer ${token}` })
});
```

Use `getSyncApi(store)` for typed access to `flush()`, `pull()`, pending mutations, status, and status subscriptions.

## CRUD backends

Coaction syncs commits, not resources: a mutation carries patches, and a REST or
SQL endpoint wants whole records. `createCrudSyncAdapter` is that translation,
and the base the service-specific adapters are built on.

```ts
import { create } from 'coaction';
import { sync } from '@coaction/sync';
import { createCrudSyncAdapter } from '@coaction/sync/crud';

const store = create(
  (set) => ({
    todos: {} as Record<string, Todo>,
    add(todo: Todo) {
      set(() => void (this.todos[todo.id] = todo));
    }
  }),
  {
    middlewares: [
      sync({
        name: 'todos',
        adapter: createCrudSyncAdapter<Todo>({
          path: ['todos'],
          list: () => api.listTodos(),
          create: (todo, { idempotencyKey }) =>
            api.createTodo(todo, { idempotencyKey }),
          update: (todo) => api.updateTodo(todo),
          delete: (todo) => api.deleteTodo(todo.id)
        })
      })
    ]
  }
);
```

Every handler receives a second argument describing the write: the operation,
the record's key, the queued mutations it carries, and an `idempotencyKey`
stable across retries. There is always a window between the remote committing a
write and the acknowledgement being persisted locally, and everything in it is
replayed on restart -- so a remote that dedupes on that key is what makes a
crash there safe. Send it as an `Idempotency-Key` header, a unique column, or
whatever the backend dedupes on.

`path` points at a collection keyed by id. A pull turns each record into a patch
there; a push reads which ids a mutation touched, looks each one up in the
store, and calls `create`, `update` or `delete` depending on whether the remote
has seen the record and whether it still exists. A record added and removed
before either reached the remote asks it for nothing.

| Option                                                    |                                                                                                                                                                       |
| :-------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getId`                                                   | Read a record's key. Defaults to its `id` field.                                                                                                                      |
| `authoritativeList`                                       | Treat a list response as the whole truth, deleting records it omits. Leave off for paged or changes-since endpoints, where an omission only means "not in this page". |
| `list` returning `{ records, cursor, revision, deleted }` | Page through, and report deletions explicitly when the endpoint can.                                                                                                  |

A failed write rejects the whole push instead of acknowledging part of it, so
the outbox keeps every mutation the remote did not take and the retry schedule
decides when to try again.

## Delivery semantics

Mutations are delivered **at least once**. The window between a remote
committing a write and the acknowledgement reaching durable storage cannot be
closed from the client: a crash inside it leaves a mutation the remote has
already taken still queued, and the restart sends it again. What happens then is
the backend's decision, not this library's.

The built-in Supabase and Firestore adapters are **last-write-wins** under that
replay. They are written so a retry cannot fail -- Supabase upserts on the id,
Firestore's `setDoc` overwrites -- but a retry that succeeds is still the old
mutation's value landing on the row:

```text
client A creates todo "hello"   -> remote takes it
client A crashes before the acknowledgement is durable
client B changes it to "goodbye"
client A restarts and replays   -> remote holds "hello" again
```

A delete replays the same way, removing a record someone recreated at that id in
the meantime. For an application where two clients edit the same record, this is
the behaviour to design around, or to replace.

Replacing it needs the remote to recognise a mutation it has already applied,
which is what `idempotencyKey` is for. A handler that carries it lets the
backend decide once:

```ts
createCrudSyncAdapter<Todo>({
  path: ['todos'],
  list: () => api.listTodos(),
  // A single transaction: apply the write and record the key, or return the
  // earlier result if the key is already there.
  create: (todo, { idempotencyKey }) => api.applyOnce(idempotencyKey, todo),
  update: (todo, { idempotencyKey }) => api.applyOnce(idempotencyKey, todo),
  delete: (todo, id, { idempotencyKey }) => api.deleteOnce(idempotencyKey, id)
});
```

On Supabase that is an RPC over a table of applied mutation ids; on Firestore, a
transaction that writes the document and the id together. Either turns the
replay into a no-op, which is the difference between at-least-once delivery and
exactly-once effect.

## Storage backends

`sync()` persists through a `SyncStorage`: `getItem`, `setItem`, `removeItem`,
each free to be synchronous or to return a promise. That is deliberately the
shape `localStorage` and React Native's `AsyncStorage` already have, so both
work with no adapter at all:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

sync({ name: 'todos', adapter, storage: AsyncStorage });
```

`localStorage` is the default because it needs no setup. It is also synchronous,
capped near 5 MB, and shared with everything else on the origin, which a store
holding real documents outgrows. `@coaction/sync/indexeddb` is the browser
answer:

```ts
import { createIndexedDbSyncStorage } from '@coaction/sync/indexeddb';

sync({
  name: 'todos',
  adapter,
  storage: createIndexedDbSyncStorage({ database: 'my-app' })
});
```

The connection opens lazily on first use and is reused. A store name the
database has not seen before is created by bumping its version, so several
storages can share one database. A failed open is retried by the next call
rather than cached, and another tab's upgrade closes this connection instead of
blocking on it.

## Supabase

`@coaction/sync/supabase` maps a keyed collection onto a Postgres table. It is
built on the CRUD adapter, so the patch-to-record translation is shared; this
adds the Postgrest calls, an optional changes-since cursor, and realtime.

```ts
import { createSupabaseSyncAdapter } from '@coaction/sync/supabase';

sync({
  name: 'todos',
  adapter: createSupabaseSyncAdapter<Todo>({
    client: supabase,
    table: 'todos',
    path: ['todos'],
    changesSince: 'updated_at',
    realtime: true
  })
});
```

`@supabase/supabase-js` is not a dependency — the client is typed structurally,
and a real `SupabaseClient` satisfies it.

Without `changesSince` every pull reads the whole table, which makes it the
whole truth: a row the table no longer has is removed locally. With it, each
pull asks only for rows newer than the last cursor, and an omitted row means
"unchanged" rather than "deleted" — a deleted row simply stops appearing.
Combine `changesSince` with `realtime`, or with a soft-delete column, when
deletions have to propagate.

A full pull is paged, by key rather than by offset, so a row removed while the
walk is running cannot push the row behind it out of the answer. It is still
several requests and not one database snapshot: a row written behind the cursor
after the walk has passed that point is absent from the answer without being
gone, and an authoritative pull reads absent as deleted. Set
`authoritativeList: false` where writes land during pulls and a wrong deletion
costs more than a stale record, or move to `changesSince` so omission stops
meaning anything at all.

## TanStack Query

`@coaction/sync/query` connects the two halves rather than duplicating either.
The query cache owns fetching — deduplication, retries, devtools, and any
component already reading the same key. Coaction owns the optimistic local
state, the durable outbox, and the commit that carries a change to the remote.

```ts
import { createQuerySyncAdapter } from '@coaction/sync/query';

sync({
  name: 'todos',
  adapter: createQuerySyncAdapter<Todo>({
    queryClient,
    queryKey: ['todos'],
    path: ['todos'],
    list: () => api.listTodos(),
    create: (todo) => api.createTodo(todo),
    update: (todo) => api.updateTodo(todo),
    delete: (todo) => api.deleteTodo(todo.id)
  })
});
```

A pull runs through `fetchQuery`, so a component showing that key sees the same
data and a fresh entry is reused rather than refetched — raise `staleTime` to
widen that window. A push writes through and then invalidates the key, so those
components refetch; set `invalidateOnPush: false` for a write-behind cache. A
cursor is part of the key, so paging does not overwrite the first page.

`@tanstack/query-core` is not a dependency; the client is typed structurally.

## Firestore

`@coaction/sync/firestore` maps a keyed collection onto a Firestore collection.
Firestore's modular API is tree-shakable functions rather than methods, so they
are passed in — which also keeps `firebase` out of this package's dependencies:

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { createFirestoreSyncAdapter } from '@coaction/sync/firestore';

sync({
  name: 'todos',
  adapter: createFirestoreSyncAdapter<Todo>({
    firestore: { getDocs, doc, setDoc, deleteDoc, onSnapshot },
    collection: collection(db, 'todos'),
    path: ['todos'],
    realtime: true
  })
});
```

`collection` is the write address: writes go through `doc(collection, id)`, so
it has to be a `CollectionReference`. To read something narrower, pass a `query`
alongside it — reads use the query, writes still use the collection, and the
pull stops being authoritative, since a document the query excludes is absent
from the answer rather than deleted.

A Firestore document does not contain its own id, so the id is merged into the
record on read and removed again on write — set `idField` when the record names
it something other than `id`. `setDoc` writes the whole document, so a create
and an update are the same call. A `docChanges()` batch becomes one patch per
change.
