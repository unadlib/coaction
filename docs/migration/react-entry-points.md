# Migrating to the local-by-default React entry

`@coaction/react` used to link the full runtime, including the transport
protocol that only worker and cross-context stores need. Every application that
imported React state paid for it — around 12 KB gzip in a minimal app, whether
or not a worker was ever created.

It now links the local runtime. Shared mode moved to `@coaction/react/shared`.

## Who has to change

Only code that passes a worker or transport option to `create` from
`@coaction/react`:

- `worker`
- `transport`
- `clientTransport`
- `transportPolicy`
- `workerType`
- `executeSyncTimeoutMs`

Everything else — plain stores, selectors, `observer()`, slices, cached getters,
`createSelector`, `auto()` — is unchanged and simply ships less code.

## How to change it

Change the import. Nothing else:

```diff
- import { create } from '@coaction/react';
+ import { create } from '@coaction/react/shared';

  const useStore = create(counter, { worker });
```

Do this in both places a shared store is created: the worker module and the
page. Mixing entries for one store does not work, because each entry is a
separate bundle with its own runtime registry.

TypeScript reports the mistake at the call site — the default entry's `create`
does not accept those options. At runtime the error names the entry to use.

## `worker: undefined` still works on the default entry

Feature detection and SSR guards pass an option that may be absent:

```js
const worker = globalThis.SharedWorker
  ? new SharedWorker(new URL('./store.js', import.meta.url), { type: 'module' })
  : undefined;
```

`undefined` (and `null`) are not rejected: there is no worker to honour, and a
local store is the right answer. Only a real value points you at the shared
entry.

Note what changes with the entry, though: on `@coaction/react/shared` a store's
actions are async, because they may cross a worker boundary, and they stay async
when the worker turns out to be absent. On the default entry they are
synchronous. If you rely on the async contract in the fallback case, create the
store from the shared entry.

## Why not keep both in one entry

Bundlers cannot drop code a public API can reach. As long as `create` from the
default entry accepted a `worker`, the transport protocol had to be present in
every bundle. Splitting the entry is what makes the cost optional, and making
local the default is what makes the common case free.

`@coaction/react/local` was that entry's explicit alias. It has since been
removed -- the default entry is the local one, so the alias only invited two
copies to drift. See `docs/migration/default-entry-is-local.md`.
