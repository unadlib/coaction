---
'@coaction/sync': minor
---

Add `@coaction/sync/supabase`, syncing a keyed collection with a Postgres table.

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
