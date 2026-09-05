---
'@coaction/react': major
'coaction': minor
---

`@coaction/react` now links the local runtime. Worker and cross-context stores
move to `@coaction/react/shared`.

The default entry used to carry the transport protocol whether or not a worker
was ever created — about 12 KB gzip in a minimal app, paid by every application
that imported React state. A minimal app goes from 31.9 KB to 19.9 KB gzip.

Only code passing `worker`, `transport`, `clientTransport`, `transportPolicy`,
`workerType` or `executeSyncTimeoutMs` to `create` from `@coaction/react` has to
change, and the change is the import:

```diff
- import { create } from '@coaction/react';
+ import { create } from '@coaction/react/shared';
```

Both sides of a shared store — the worker module and the page — take the same
entry. TypeScript reports the mistake at the call site, and the runtime error
names the entry to switch to. See `docs/migration/react-entry-points.md`.

An option whose value is `undefined` or `null` is no longer treated as a request
for the shared runtime. `{ worker: maybeWorker }` where the worker is absent —
feature detection, an SSR guard — degrades to a local store on any entry, which
is what that code wants. Note that a store created from the shared entry keeps
async actions in that fallback, because they may cross a worker boundary; the
local entry's are synchronous.
