# @coaction/sync

## 4.0.0

### Major Changes

- `store.apply` belongs to Coaction on every store, and an external adapter now
  says only how to write into its own runtime.

  An adapter used to replace `store.apply` outright. That handed it commit
  semantics it did not want: none of them published a commit, so `store.apply()`
  on a MobX, Valtio or Pinia store changed the state and told nobody —
  `@coaction/history` had nothing to undo and `@coaction/sync` never queued it.
  Putting the commit pipeline back around whatever an adapter installed then
  produced three separate ways to publish the same transition twice, each found
  and fixed in turn. And because middleware runs before the binder, replacing
  `apply` silently discarded anything middleware had wrapped it with.

  An adapter now sets `internal.externalApply` — how to get a change onto its
  runtime, and nothing else. Coaction works out the patch pair before the change,
  runs commit validators, calls the writer, and publishes the commit, in one place
  for every adapter. Middleware that wraps `store.apply` keeps working on stores
  built through a binder.

  **If you maintain a third-party adapter**, replace `store.apply = writer` with
  `internal.externalApply = writer`. The signature is unchanged. Do not publish a
  commit from it; Coaction does that.

  `store.apply(state, patches)` also now requires `state` to be the state the
  store holds — omit it, or pass `getPureState()`. A patch pair describes a change
  to the current state, so applying it to anything else left the store somewhere
  its own commits did not lead.

- 3be75d1: A third review pass, mostly about what happens at a crash boundary and at the
  seams between the core and its adapters.

  **CRUD handlers now receive the mutation a write carries.** The outbox gives each
  mutation a stable id so a remote that dedupes on it makes a retry after a crash
  safe; the handlers took only a record, so no CRUD-based adapter could honour the
  contract the README described. `create`, `update` and `delete` take a second
  argument with the operation, the record, the queued mutation ids, and a stable
  `idempotencyKey`.

  **Supabase creates survive their own replay.** `insert()` met its own row after a
  crash between the remote committing and the acknowledgement persisting, and
  failed forever on a unique constraint. It is now an upsert on the id column.

  **The adapter's view of the remote advances only when the store takes a result.**
  A new `SyncAdapter.accept(result)` runs after the rebase and before the
  checkpoint, so a pull discarded as stale, or a subscription arriving mid
  hydration, no longer leaves the adapter describing a remote the store never
  accepted.

  **Firestore realtime updates the baseline**, which it did not while Supabase's
  did — a document learned about only through `onSnapshot` could be deleted
  locally with no `deleteDoc` ever sent. A removal from a narrowed read does not
  count, since leaving a query is not leaving the collection.

  **Supabase `schema` applies to reads and writes**, not just the realtime filter,
  which previously watched one table while reading and writing another. A
  non-default schema now requires a client exposing `schema()`.

  **Supabase pulls page by key rather than by offset**, so a row deleted mid-pull
  no longer pushes the row behind it out of an authoritative snapshot, and the
  record ceiling is checked before the loop ends rather than after.

  **`sync()` refuses a runtime with nowhere durable to write.** `localStorage` was
  checked on every call and silently skipped when absent, so a Worker — the
  environment this library exists to support — ran with a memory-only outbox while
  calling it durable. Pass `storage: false` to choose that deliberately.

  **`@coaction/react` compares carried state values by identity as well as
  version.** A version is a sum of path versions, so two untouched siblings share
  one: a reused wrapper swapping between them compared equal and skipped the
  render.

  **A remote fact counts when it arrives, not when it finishes applying.** A
  successful push that answered without patches never advanced the staleness
  guard, so a pull already in flight was judged current on return and rolled back
  a write the remote had committed and the outbox had acknowledged — and `{}` is
  what every built-in CRUD adapter returns from `push`. The check was also a
  check-then-act, so a subscription that had arrived and was still queued left it
  unchanged too. The epoch now moves on arrival, the check runs inside the apply
  lane, and every push result goes through that lane whether or not it carries
  patches.

  **CRUD writes return what the backend made of them.** A `create` or `update`
  that answers with the stored record now produces patches, so the store stops
  disagreeing with the row it just wrote until some later pull corrects it.

  **Delivery semantics are written down.** Mutations are at-least-once, and the
  built-in Supabase and Firestore adapters are last-write-wins under replay —
  retry-safe, which is not the same as idempotent. The README shows the replay
  that surprises people and what a handler built on `idempotencyKey` looks like
  instead.

  **A Supabase full pull can decline to be authoritative.** Keyset paging removed
  offset drift; it does not make several requests one snapshot, so
  `authoritativeList` is now an option rather than a derived value.

  **A mutation's idempotency key no longer changes when it is reclassified.** The
  key included the operation, which is decided against the adapter's baseline at
  send time — so a create whose answer was lost, retried after realtime reported
  the row it made, went out as an update under a different key. A ledger keyed on
  the first one would apply the write twice, which is the failure the key exists
  to prevent.

  **Authoritative deletions come from the durable baseline, not the current
  store.** With `persistState: false` a restarted store is empty, so a record the
  remote had dropped produced no removal and the baseline kept claiming it; and a
  record created locally but never sent produced a removal for something the
  remote never had, which only the default conflict policy was undoing.

  **State has to be JSON, and saying so beats rewriting it.** Everything persisted
  goes through `JSON.stringify`, while Coaction's local core does not require
  JSON — so a `Date` came back a string, a `Map` came back `{}`, and nothing said
  so until something downstream read the wrong type. `sync()` now refuses such
  state with the path to the value, checks each commit's patches, and encodes
  inside the queued write so a `BigInt` or a cycle fails the write instead of
  throwing back out of the `set()` that already committed.

  **A push answer overtaken by something newer is not applied.** Arrival order is
  not commit order: an answer describing what the server made of an earlier write
  would put that value back over an edit that has since arrived. The
  acknowledgement stands; the state it describes is left to a pull.

- 7d98c5f: Corrections to `@coaction/sync` from a second external review, all of them
  reproduced before being fixed.

  **The CRUD adapter now remembers what the remote holds.** That knowledge decided
  create versus update and lived only in memory, while the outbox it interpreted
  was durable — so after a restart, editing a record pulled in an earlier session
  sent `create` (a primary key collision on any backend that has one), clearing a
  collection sent nothing at all and acknowledged the mutation anyway, and a
  record that arrived by realtime was never seen by the adapter at all. The
  baseline is now written into the same checkpoint as the outbox through two new
  optional `SyncAdapter` hooks, `serialize()` and `hydrate()`.

  **A missing CRUD handler fails the push instead of acknowledging it.** A mutation
  needing an operation the adapter was not given was skipped, and the push then
  returned normally — which the protocol reads as "the remote took everything".
  It now throws `UnsupportedCrudOperationError` and the mutation stays queued.

  **Every remote result is applied through one ordered lane.** Pull, push answers
  and subscriptions each applied independently, so two rebases could interleave.
  A pull is additionally re-asked when the state it was computed against has
  moved, since its answer describes a base that is gone.

  **Supabase full pulls are paged**, so the response cap can no longer be mistaken
  for the whole table and delete everything past it, and the changes-since cursor
  now names a row rather than an instant, so rows sharing a timestamp are not
  stepped over.

  **Firestore separates its read source from its write address.** `collection` must
  be a `CollectionReference`, since writes go through `doc(collection, id)`; pass
  a `Query` as the new `query` option to read something narrower, which also stops
  the pull being authoritative.

  **A reused selector wrapper no longer hides changes inside it** in
  `@coaction/react`: a wrapper the selector returns every time compared equal
  forever, because only a directly returned state value had its version compared.

### Minor Changes

- e58179a: Track reactivity per state path, to any depth.

  Dependencies used to stop at the top-level property: everything reached through
  `state.user` shared one slot, so writing `user.profile.age` woke every consumer
  that had read anything under `user`. Reading `state.user.profile.name` now
  records a dependency on that leaf, and an unrelated sibling update no longer
  re-runs the selector. Flat state shapes are unaffected -- they were already
  tracked at this granularity. Dependency nodes are reference-counted and
  reclaimed, and a store with no reactive consumer keeps taking the patch-free
  write path.

  The trade is a slower property read through the public state, since every access
  goes through the tracking proxy. Reads outside a tracked scope — action bodies,
  event handlers, a bare `getState()` — skip that work entirely and stay at the
  cost of a plain proxy.

  `whole()` is the escape hatch for the case where per-element precision is
  wasted: a selector that scans a collection. It records one dependency on the
  value and returns the plain object, so the scan runs at plain-object speed and
  still re-runs whenever anything inside changes. Scanning a 2000-element array in
  a tracked selector goes from 0.62 ms to 0.013 ms.

  Also in this release:

  - `@coaction/react` gains a `@coaction/react/shared` entry point, so an app that
    never uses a worker no longer bundles the transport runtime. A tracked component now releases its path nodes as soon as
    React unmounts it, instead of holding them for the uncommitted-render window.
  - `@coaction/sync` is new: commit-based local-first synchronization with a
    durable optimistic snapshot and outbox, pre-hydration journaling, conflict
    policies, path-local rebase inverses, status subscriptions, retry with
    backoff, and a fetch adapter. A pending mutation that a remote change has made
    impossible to replay — its parent was deleted, say — is dropped and reported
    through `onError` rather than retried forever. A remote that acknowledges only
    part of a push hands the rest to the backoff timer instead of reporting idle
    with work still undelivered, and a storage read that throws is reported
    through `onError` without also escaping as an unhandled rejection.

- e58179a: Add `@coaction/sync/crud`, a CRUD adapter for list/create/update/delete backends.

  Coaction syncs commits, not resources: a mutation carries patches, and a REST or
  SQL endpoint wants whole records. `createCrudSyncAdapter` is that translation. A
  pull turns records into patches at a collection path; a push reads which ids a
  mutation touched, looks each one up in the store, and calls `create`, `update`
  or `delete` depending on whether the remote has seen the record and whether it
  still exists.

  It handles the cases that make this awkward to write by hand: a record added and
  removed before either reached the remote asks it for nothing, an authoritative
  list can delete records it omits while a paged one cannot, and an incremental
  endpoint can report deletions explicitly.

  `SyncAdapter` gains an optional `bind(store)`, called once before any pull or
  push, so an adapter that has to read current state does not make the caller
  thread the store back into its own options.

- e58179a: Add `@coaction/sync/firestore`, syncing a keyed collection with a Firestore
  collection.

  Built on the CRUD adapter. What it adds is the part that is easy to get wrong: a
  Firestore document does not contain its own id, so the id is merged into the
  record on read and stripped again on write, and a `docChanges()` batch becomes
  one patch per change.

  Firestore's modular API is tree-shakable functions rather than methods, so they
  are passed in as `firestore: { getDocs, doc, setDoc, deleteDoc, onSnapshot }`,
  which also keeps `firebase` out of this package's dependencies. `collection` is
  the `CollectionReference` documents are written to; pass a `query` alongside it
  to read something narrower.

- e58179a: Add `@coaction/sync/indexeddb`, durable storage backed by IndexedDB.

  `localStorage` stays the default because it needs no setup, but it is
  synchronous, capped near 5 MB, and shared with everything else on the origin — a
  store holding real documents outgrows it.

  The connection opens lazily and is reused. A store name the database has not
  seen before is created by bumping its version, so several storages can share one
  database; a failed open is retried by the next call rather than cached as
  permanent; and another tab's upgrade closes this connection instead of blocking
  on it.

  React Native needs no plugin: `SyncStorage` is already the shape `AsyncStorage`
  has, so it can be passed directly.

- e58179a: Add `@coaction/sync/query`, syncing a keyed collection through a TanStack Query
  cache.

  The two own different halves and this connects them rather than duplicating
  either: the query cache owns fetching — deduplication, retries, devtools, and
  any component already reading the same key — while Coaction owns the optimistic
  local state, the durable outbox, and the commit that carries a change to the
  remote.

  A pull runs through `fetchQuery`, so a fresh entry is reused rather than
  refetched and a component showing that key sees the same data. A push writes
  through the CRUD calls and then invalidates the key so those components refetch.
  A cursor is part of the query key, so paging does not overwrite the first page.

  `@tanstack/query-core` is not a dependency; the client is typed structurally.

- e58179a: Add `@coaction/sync/supabase`, syncing a keyed collection with a Postgres table.

  Built on the CRUD adapter, so the patch-to-record translation is shared; this
  adds the Postgrest calls, an optional changes-since cursor, and realtime through
  `postgres_changes`.

  `@supabase/supabase-js` is not a dependency — the client is typed structurally
  and a real `SupabaseClient` satisfies it.

  Without `changesSince` a pull reads the whole table and is treated as the whole
  truth, removing rows the table no longer has. With it, a pull asks only for rows
  past the last cursor, and an omitted row means "unchanged" rather than
  "deleted"; pair it with `realtime` or a soft-delete column when deletions have
  to propagate.

- 851ed39: The durable checkpoint and the pre-hydration journal now carry a
  `formatVersion`, and both are read as untrusted input rather than asserted into
  shape.

  A checkpoint written by a build with a newer format is refused and left exactly
  where it is: what is in it are writes somebody made, and guessing at them is
  worse than telling the application it cannot read them. A checkpoint that is not
  JSON, or whose outbox holds a malformed mutation, is refused the same way --
  hydration rejects, `sync.flush()` and `sync.pull()` surface it, and status goes
  to `error`. Previously such data flowed into the replay and failed much further
  in, as an error about patches rather than about where they came from.

  A partly-valid outbox is refused whole rather than filtered. The mutations are a
  sequence of deltas, so replaying the survivors of a bad one rebuilds a different
  state than the user left, without saying so.

  Checkpoints written before `formatVersion` existed are read as format 1, which
  is what they are. No migration is needed.

### Patch Changes

- Updated dependencies
- Updated dependencies [d393227]
- Updated dependencies [e58179a]
- Updated dependencies [8dfbe1b]
- Updated dependencies [fa03a28]
- Updated dependencies [ccea3c9]
- Updated dependencies [e58179a]
- Updated dependencies [3be75d1]
  - coaction@4.0.0

## 3.2.1

- Add commit-based durable local-first synchronization middleware.
