---
'@coaction/sync': minor
---

Add `@coaction/sync/indexeddb`, durable storage backed by IndexedDB.

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
