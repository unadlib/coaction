---
'@coaction/sync': major
'@coaction/react': patch
'coaction': patch
---

A third review pass, mostly about what happens at a crash boundary and at the
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
