---
'@coaction/sync': minor
---

Add `@coaction/sync/query`, syncing a keyed collection through a TanStack Query
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
