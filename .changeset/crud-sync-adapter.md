---
'@coaction/sync': minor
---

Add `@coaction/sync/crud`, a CRUD adapter for list/create/update/delete backends.

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
