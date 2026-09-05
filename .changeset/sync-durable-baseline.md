---
'@coaction/sync': major
'@coaction/react': patch
---

Corrections to `@coaction/sync` from a second external review, all of them
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
