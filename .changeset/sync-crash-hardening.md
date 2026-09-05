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
